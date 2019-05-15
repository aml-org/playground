import * as jsonld from 'jsonld'
import { UnitModel } from './units_model'
import * as amf from 'amf-client-js'
import { model } from 'amf-client-js'

export type ModelLevel = 'document' | 'domain';

const apiModelGenerator = amf.AMF.amfGraphGenerator()

/**
 * A proxy class to interact with the clojure code containing the logic to interact with a API Model
 */
export class ModelProxy {
  // holders for the generated strings
  public apiModelString: string = '';
  public raw: string = '';

  constructor (public model: amf.model.document.BaseUnit) {
    this.raw = this.model.raw
  }

  location (): string {
    return this.model.location
  }

  toAPIModelProcessed (level: ModelLevel, compacted: boolean, stringify: boolean, options: any, cb) {
    try {
      const liftedModel = (level === 'document') ? this.model : amf.AMF.resolveRaml10(this.model)
      const res = apiModelGenerator.generateString(liftedModel).then((res) => {
        const parsed = JSON.parse(res)[0]
        if (compacted) {
          const context = {
            'raml-doc': 'http://a.ml/vocabularies/document#',
            'raml-http': 'http://a.ml/vocabularies/http#',
            'raml-shapes': 'http://a.ml/vocabularies/shapes#',
            'hydra': 'http://www.w3.org/ns/hydra/core#',
            'shacl': 'http://www.w3.org/ns/shacl#',
            'schema-org': 'http://schema.org/',
            'xsd': 'http://www.w3.org/2001/XMLSchema#'
          }

          jsonld.compact(parsed, context, (err, compacted) => {
            if (err != null) {
            }
            const finalJson = (err == null) ? compacted : parsed
            this.apiModelString = JSON.stringify(finalJson, null, 2)
            if (stringify) {
              cb(err, this.apiModelString)
            } else {
              cb(err, finalJson)
            }
          })
        } else {
          this.apiModelString = JSON.stringify(parsed, null, 2)
          if (stringify) {
            cb(null, this.apiModelString)
          } else {
            cb(null, parsed)
          }
        }
      }).catch(cb)
    } catch (e) {
      cb(e)
    }
  }

  public units (modelLevel: ModelLevel, cb) { new UnitModel(this).process(modelLevel, cb) }

  /**
   * Returns all the files referenced in a document model
   * @returns {string[]}
   */
  references (): string[] {
    const files: string[] = []
    files.push(this.location())
    return files.concat(this.transitiveReferences().map((u) => u.location))
  }

  nestedModel (location: string): ModelProxy {
    if (location == this.model.location) {
      return this
    } else {
      const unit = this.transitiveReferences().filter((ref) => {
        return ref.location === location ||
                  ref.location === location.substring(0, location.length - 1)
      })[0]
      return new ModelProxy(unit)
    }
  }

  private _transitiveRefs: model.document.BaseUnit[] = null;

  transitiveReferences (): model.document.BaseUnit[] {
    if (this._transitiveRefs == null) {
      const refsAcc = {}
      this.model.references().forEach((ref) => refsAcc[ref.location] = ref)
      var pending: model.document.BaseUnit[] = this.model.references()
      while (pending.length > 0) {
        const next: model.document.BaseUnit = pending.pop()
        next.references().forEach((ref) => {
          if (refsAcc[ref.location] == null) {
            refsAcc[ref.location] = ref
            pending = pending.concat(ref.references())
          }
        })
      }
      var acc: model.document.BaseUnit[] = []
      for (var p in refsAcc) {
        acc.push(refsAcc[p])
      }
      this._transitiveRefs = acc
    }

    return this._transitiveRefs
  }

  findElement (id: string): amf.model.domain.DomainElement | undefined {
    return this.model.findById(id)
  }

  elementLexicalInfo (id: string): amf.core.parser.Range | undefined {
    const element = this.findElement(id)
    if (element != null) {
      return element.position
    }
  }
}
