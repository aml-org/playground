import { PlaygroundGraph } from '../main/graph'
import * as ko from 'knockout'
import * as amf from 'amf-client-js'

export type EditorSection = 'document' | 'dialect';

export class ViewModel {
  public editorSection: ko.KnockoutObservable<EditorSection> = ko.observable<EditorSection>('document');
  public documentUnits: ko.KnockoutObservableArray<any> = ko.observableArray<any>([]);

  public documentModel?: any = undefined;
  public dialectModel?: any = undefined;
  public selectedModel?: any = undefined;

  public graph: any;
  public amlParser?

  public base = window.location.href.toString().replace('/visualization.html', '')
  public defaultDialect = `${this.base}/examples/pods/dialect.yaml`
  public defaultDocument = `${this.base}/examples/pods/document.yaml`

  public changesFromLastUpdate = 0;
  public someModelChanged = false;
  public RELOAD_PERIOD = 1000;

  constructor (public editor: any) {
    this.amlParser = new amf.Aml10Parser()

    this.editor.onDidChangeModelContent(() => {
      this.handleModelContentChange()
    })

    this.editorSection.subscribe((oldSection) => {
      this.someModelChanged = true
      return this.updateModels(oldSection)
    }, null, 'beforeChange')

    this.editorSection.subscribe((newSection) => {
      this.onEditorSectionChange(newSection)
    })
  }

  private onEditorSectionChange (newSection: EditorSection) {
    if (newSection === 'document') {
      this.selectedModel = this.documentModel
    } else {
      this.selectedModel = this.dialectModel
    }
    this.editor.setModel(this.createModel(this.selectedModel.raw, 'aml'))
    this.resetUnits(() => { this.resetGraph() })
  }

  public apply () {
    window['viewModel'] = this
    amf.AMF.init()
      .then(() => {
        ko.applyBindings(this)
        return this.loadInitialDialect()
      })
      .then(() => {
        return this.loadInitialDocument()
      })
      .then(() => {
        this.resetUnits(() => { this.resetGraph() })
      })
  }

  public createModel (text, mode) {
    return window['monaco'].editor.createModel(text, mode)
  }

  public handleModelContentChange () {
    this.changesFromLastUpdate++
    this.someModelChanged = true;
    ((number) => {
      setTimeout(() => {
        if (this.changesFromLastUpdate === number) {
          return this.updateModels()
            .then(() => {
              this.selectedModel = this.editorSection() === 'document'
                ? this.documentModel
                : this.dialectModel
              this.resetUnits(() => { this.resetGraph() })
            })
        }
      }, this.RELOAD_PERIOD)
    })(this.changesFromLastUpdate)
  }

  public updateModels (section?: EditorSection) {
    if (!this.someModelChanged) {
      return Promise.resolve()
    }
    this.someModelChanged = false
    this.changesFromLastUpdate = 0
    section = section || this.editorSection()
    const value = this.editor.getModel().getValue()
    if (!value) {
      return Promise.resolve()
    }
    const location = section === 'document'
      ? this.documentModel.location
      : this.dialectModel.location
    return this.amlParser.parseStringAsync(location, value)
      .then(model => {
        if (section === 'document') {
          this.documentModel = model
        } else {
          this.dialectModel = model
        }
      })
      .catch(err => {
        console.error(`Error parsing section "${section}": ${err}`)
      })
  }

  public loadInitialDocument () {
    return this.amlParser.parseFileAsync(this.defaultDocument)
      .then(model => {
        this.documentModel = model
        this.selectedModel = this.documentModel
        this.editor.setModel(this.createModel(this.selectedModel.raw, 'aml'))
        this.someModelChanged = false
        this.changesFromLastUpdate = 0
      })
  }

  public loadInitialDialect () {
    return this.amlParser.parseFileAsync(this.defaultDialect)
      .then(model => {
        this.dialectModel = model
      })
  }

  // Recursively collects tree nodes from JSON-LD document into a flat array
  public collectTreeNodes (data: object, parentId: string, defaultLabel?: string) {
    let elements = []

    // Data is not an object or array
    if (typeof data !== 'object') {
      return elements
    }

    // Data is an array
    if (Array.isArray(data)) {
      data.forEach(el => {
        elements.push(...this.collectTreeNodes(el, parentId))
      })
      return elements
    }

    // Data is object and has `@id` property
    if (data['@id']) {
      let nameNode = data['http://schema.org/name'] ||
                     data['http://www.w3.org/ns/shacl#name'] ||
                     [{}]
      let label = nameNode[0]['@value'] || defaultLabel
      if (label) {
        elements.push({
          id: data['@id'],
          parentId: parentId,
          label: label
        })
        parentId = data['@id']
      }
    }

    // Process nested properties
    Object.entries(data).forEach(([key, val]) => {
      elements.push(...this.collectTreeNodes(val, parentId))
    })
    return elements
  }

  private resetUnits (cb: () => void = () => {}) {
    this.documentUnits.removeAll()
    if (this.selectedModel === null) {
      return
    }
    return amf.AMF.amfGraphGenerator().generateString(this.selectedModel)
      .then(gen => {
        let data = JSON.parse(gen)[0]
        this.documentUnits.push(...this.collectTreeNodes(data, undefined, 'Root'))
        if (cb) { cb() }
      })
  }

  public resetGraph () {
    try {
      document.getElementById('graph-container-inner').innerHTML = ''
      this.graph = new PlaygroundGraph(
        this.selectedModel.location,
        'document',
        (id: string, unit: any) => {
          this.onSelectedGraphId(id, unit)
        }
      )
      this.graph.process(this.documentUnits())
      this.graph.render('graph-container-inner')
    } catch (err) {
      console.error(`Failed to reset graph: ${err}`)
    }
  }

  public elementLexicalInfo (model: any, id: string): amf.core.parser.Range | undefined {
    const element = model.findById(id)
    if (element != null) {
      return element.position
    }
  }

  private decorations: any = [];

  private onSelectedGraphId (id, unit) {
    if (this.selectedModel === null || id === undefined || unit === undefined) {
      return
    }

    const lexicalInfo: amf.core.parser.Range = this.elementLexicalInfo(this.selectedModel, id)

    let startLine = this.editorSection() === 'dialect'
      ? lexicalInfo.start.line - 1
      : lexicalInfo.start.line

    if (lexicalInfo != null) {
      this.editor.revealRangeInCenter({
        startLineNumber: startLine,
        startColumn: lexicalInfo.start.column,
        endLineNumber: lexicalInfo.end.line - 1,
        endColumn: lexicalInfo.end.column
      })
      this.decorations = this.editor.deltaDecorations(this.decorations, [
        {
          range: new monaco.Range(
            startLine,
            lexicalInfo.start.column,
            lexicalInfo.end.line - 1,
            lexicalInfo.end.column),
          options: {
            linesDecorationsClassName: 'selected-element-line-decoration',
            isWholeLine: true
          }
        }
      ])
    } else {
      this.decorations = this.editor.deltaDecorations(this.decorations, [])
    }
  }
}
