import { Document } from '../main/units_model'
import { ModelProxy } from '../main/model_proxy'
import { PlaygroundGraph } from '../main/graph'
import * as ko from 'knockout'
import * as amf from 'amf-client-js'

export type EditorSection = 'document' | 'dialect';

export class ViewModel {
  public editorSection: ko.KnockoutObservable<EditorSection> = ko.observable<EditorSection>('document');
  public documentUnits: ko.KnockoutObservableArray<Document> = ko.observableArray<Document>([]);

  public documentModel?: ModelProxy = undefined;
  public dialectModel?: ModelProxy = undefined;
  public selectedModel?: ModelProxy = undefined;

  public graph: any;
  public amlParser?

  public base = window.location.href.toString().replace('visualization.html', '')
  public defaultDialect = `${this.base}spec_examples/pods/dialect.yaml`
  public defaultDocument = `${this.base}spec_examples/pods/document.yaml`

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
    this.editor.setModel(this.createModel(this.selectedModel!.raw, 'aml'))
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
      ? this.documentModel.location()
      : this.dialectModel.location()
    return this.amlParser.parseStringAsync(location, value)
      .then(model => {
        if (section === 'document') {
          this.documentModel = new ModelProxy(model)
        } else {
          this.dialectModel = new ModelProxy(model)
        }
      })
      .catch(err => {
        console.error(`Error parsing section "${section}": ${err}`)
      })
  }

  public loadInitialDocument () {
    return this.amlParser.parseFileAsync(this.defaultDocument)
      .then(model => {
        this.documentModel = new ModelProxy(model)
        this.selectedModel = this.documentModel
        this.editor.setModel(this.createModel(this.selectedModel.raw, 'aml'))
        this.someModelChanged = false
        this.changesFromLastUpdate = 0
      })
  }

  public loadInitialDialect () {
    return this.amlParser.parseFileAsync(this.defaultDialect)
      .then(model => {
        this.dialectModel = new ModelProxy(model)
      })
  }

  private resetUnits (cb: () => void = () => {}) {
    if (this.selectedModel === null) {
      this.documentUnits.removeAll()
      return
    }
    this.selectedModel.units('document', (err, units) => {
      if (err === null) {
        let unitsMap = {}
        this.documentUnits().forEach(unit => {
          unitsMap[unit.id] = unit
        })
        this.documentUnits.removeAll()
        units.documents.forEach(doc => {
          if (unitsMap[doc.id] != null) {
            doc['expanded'] = unitsMap[doc.id]['expanded']
          }
          this.documentUnits.push(doc)
        })
      } else {
        console.error(`Error loading units: ${err}`)
      }
      if (cb) { cb() }
    })
  }

  public resetGraph () {
    try {
      document.getElementById('graph-container-inner').innerHTML = ''
      let oldGraph = this.graph
      this.graph = new PlaygroundGraph(
        this.selectedModel.location(),
        'document',
        (id: string, unit: any) => {
          this.onSelectedGraphId(id, unit)
        }
      )
      this.graph.process(this.documentUnits())
      this.graph.render('graph-container-inner', () => {
        if (oldGraph != null) {
          if (this.graph.paper) {
            this.graph.paperScale(oldGraph.scaleX, oldGraph.scaleY)
          }
        }
      })
    } catch (err) {
      console.error(`Failed to reset graph: ${err}`)
    }
  }

  private decorations: any = [];

  private onSelectedGraphId (id, unit) {
    if (this.selectedModel === null || id === undefined || unit === undefined) {
      return
    }

    const lexicalInfo: amf.core.parser.Range = this.selectedModel.elementLexicalInfo(id)
    if (lexicalInfo != null) {
      this.editor.revealRangeInCenter({
        startLineNumber: lexicalInfo.start.line - 1,
        startColumn: lexicalInfo.start.column,
        endLineNumber: lexicalInfo.end.line - 1,
        endColumn: lexicalInfo.end.column
      })
      this.decorations = this.editor.deltaDecorations(this.decorations, [
        {
          range: new monaco.Range(
            lexicalInfo.start.line - 1,
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