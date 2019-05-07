import * as ko from 'knockout'
import { Document } from '../main/units_model'
import { Diagram } from '../view_models/diagram'
import * as amf from 'amf-client-js'

export type EditorSection = 'document' | 'dialect';

export class ViewModel {
  public editorSection: ko.KnockoutObservable<EditorSection> = ko.observable<EditorSection>('document');
  public documentUnits: ko.KnockoutObservableArray<Document> = ko.observableArray<Document>([]);

  public documentModel?: amf.model.document.BaseUnit = undefined;
  public dialectModel?: amf.model.document.BaseUnit = undefined;
  public diagram: any;
  public amlParser?

  public base = window.location.href.toString().replace('visualization.html', '')
  public defaultDialect = `${this.base}spec_examples/music/dialect.yaml`
  public defaultDocument = `${this.base}spec_examples/music/document.yaml`

  public changesFromLastUpdate = 0;
  public someModelChanged = false;
  public RELOAD_PERIOD = 1000;

  constructor (public editor: any) {
    amf.AMF.init()
      .then(() => {
        this.amlParser = new amf.Aml10Parser()
        return this.loadInitialDocument()
      })
      .then(() => {
        return this.loadInitialDialect()
      })

    this.editor.onDidChangeModelContent(this.handleModelContentChange)
    this.editorSection.subscribe((oldSection) => {
      this.updateModel(oldSection)
    }, null, 'beforeChange')
    this.editorSection.subscribe((section) => {
      this.onEditorSectionChange(section)
    })
  }

  public apply (location: Node) {
    window['viewModel'] = this
    ko.applyBindings(this)
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
          return this.updateModel().then(() => {
            this.resetUnits()
            this.resetDiagram()
          })
        }
      }, this.RELOAD_PERIOD)
    })(this.changesFromLastUpdate)
  }

  public updateModel (section?: EditorSection) {
    if (!this.someModelChanged) {
      return
    }
    this.someModelChanged = false
    this.changesFromLastUpdate = 0
    section = section || this.editorSection()
    const value = this.editor.getModel().getValue()

    return this.amlParser.parseStringAsync(value)
      .then(model => {
        const modelName = this.getModelName(section)
        this[modelName] = model
      })
      .catch(err => {
        console.error(`Error parsing section "${section}": ${err}`)
      })
  }

  public loadInitialDocument () {
    this.changesFromLastUpdate = 0
    return this.amlParser.parseFileAsync(this.defaultDocument)
      .then(model => {
        this.documentModel = model
        this.editor.setModel(this.createModel(this.documentModel.raw, 'aml'))
      })
  }

  public loadInitialDialect () {
    this.changesFromLastUpdate = 0
    return this.amlParser.parseFileAsync(this.defaultDialect)
      .then(model => {
        this.dialectModel = model
      })
  }

  private onEditorSectionChange (section: EditorSection) {
    const modelName = this.getModelName()
    this.editor.setModel(this.createModel(this[modelName]!.raw, 'aml'))
    this.resetDiagram()
  }

  public getModelName (section?: EditorSection) {
    section = section || this.editorSection()
    const modelName = section === 'document'
      ? 'documentModel'
      : 'dialectModel'
    return modelName
  }

  private resetUnits (cb: () => void = () => {}) {
    const modelName = this.getModelName()
    if (this[modelName] === null) {
      this.documentUnits.removeAll()
      return
    }
    this[modelName].units('document', (err, units) => {
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

  public resetDiagram () {
    try {
      const modelName = this.getModelName()
      document.getElementById('graph-container-inner').innerHTML = ''
      let oldDiagram = this.diagram
      this.diagram = new Diagram(
        this[modelName]!.location(),
        'domain',
        (id: string, unit: any) => {
          this.onSelectedDiagramId(id, unit)
        }
      )
      this.diagram.process(this.documentUnits())
      this.diagram.render('graph-container-inner', () => {
        if (oldDiagram != null) {
          if (this.diagram.paper) {
            this.diagram.paperScale(oldDiagram.scaleX, oldDiagram.scaleY)
          }
        }
      })
    } catch (err) {
      console.error(`Failed to reset graph: ${err}`)
    }
  }

  private decorations: any = [];

  private onSelectedDiagramId (id, unit) {
    const modelName = this.getModelName()
    if (this[modelName] === null || id === undefined || unit === undefined) {
      return
    }

    const lexicalInfo: amf.core.parser.Range = this[modelName].elementLexicalInfo(id)
    if (lexicalInfo != null) {
      this.editor.revealRangeInCenter({
        startLineNumber: lexicalInfo.start.line,
        startColumn: lexicalInfo.start.column,
        endLineNumber: lexicalInfo.end.line,
        endColumn: lexicalInfo.end.column
      })
      this.decorations = this.editor.deltaDecorations(this.decorations, [
        {
          range: new monaco.Range(
            lexicalInfo.start.line,
            lexicalInfo.start.column,
            lexicalInfo.end.line,
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
