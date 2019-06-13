import * as jsonld from 'jsonld'
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
