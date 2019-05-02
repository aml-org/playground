import * as ko from 'knockout'
import * as amf from 'amf-client-js'
const Vocabularies = amf.plugins.document.Vocabularies

export class ViewModel {
  public dialectModel: any | null = null;
  public documentModel: any | null = null;

  public changesFromLastUpdate = 0;
  public someModelChanged = false;
  public RELOAD_PERIOD = 1000;

  public amlParser?
  public profileName: amf.ProfileName;

  public base = window.location.href.toString().replace('validation.html', '')
  public defaultDocUrl = 'http://a.ml/amf/default_document'

  public constructor (public dialectEditor: any, public documentEditor: any) {
    amf.AMF.init()
      .then(() => {
        this.amlParser = new amf.Aml10Parser()
        return this.loadInitialDialectContent()
      })
      .then(() => {
        return this.loadInitialDocumentContent()
      })

    this.documentEditor.onDidChangeModelContent(() => {
      this.handleModelContentChange(this.parseDocumentEditorContent)
    })
    this.dialectEditor.onDidChangeModelContent(() => {
      this.handleModelContentChange(this.registerDialectEditorContent)
    })
  }

  public apply (location: Node) {
    window['viewModel'] = this
    ko.applyBindings(this)
  }

  public createModel (text, mode) {
    return window['monaco'].editor.createModel(text, mode)
  }

  public loadInitialDialectContent () {
    this.changesFromLastUpdate = 0
    const dialectPath = `${this.base}spec-examples/music/dialect.yaml`
    return this.amlParser.parseFileAsync(dialectPath)
      .then(model => {
        this.dialectModel = model
        this.dialectEditor.setModel(this.createModel(this.dialectModel.raw, 'aml'))
        return this.registerDialectEditorContent()
      })
  }

  public loadInitialDocumentContent () {
    this.changesFromLastUpdate = 0
    const documentPath = `${this.base}spec-examples/music/document.yaml`
    return this.amlParser.parseFileAsync(documentPath)
      .then(model => {
        this.documentEditor.setModel(this.createModel(model.raw, 'aml'))
        this.documentModel = model
        this.doValidate()
      })
  }

  public handleModelContentChange (parsingFn) {
    this.changesFromLastUpdate++
    this.someModelChanged = true;
    ((number) => {
      setTimeout(() => {
        if (this.changesFromLastUpdate === number) {
          this.changesFromLastUpdate = 0
          parsingFn()
        }
      }, this.RELOAD_PERIOD)
    })(this.changesFromLastUpdate)
  }

  public registerDialectEditorContent () {
    const editorValue = this.dialectEditor.getValue()
    if (!editorValue) {
      return
    }
    const location = this.dialectModel.location() || this.defaultDocUrl
    return Vocabularies.registerDialect(location, editorValue)
      .then(dialect => {
        this.profileName = new amf.ProfileName(dialect.nameAndVersion())
        this.doValidate()
      })
  }

  public parseDocumentEditorContent () {
    const editorValue = this.documentEditor.getValue()
    return this.amlParser.parseStringAsync(editorValue)
      .then(model => {
        this.documentModel = model
        this.doValidate()
      })
      .catch((err) => {
        console.error(`Failed to parse document: ${err}`)
      })
  }

  public doValidate () {
    if (this.dialectModel === null || this.documentModel === null) {
      return
    }
    amf.AMF.validate(this.documentModel, this.profileName, amf.MessageStyles.RAML)
      .then(report => {
        const model = this.documentEditor.getModel()
        const monacoErrors = report.results.map((result) => {
          return this.buildMonacoError(result)
        })
        monaco.editor.setModelMarkers(model, model.id, monacoErrors)
        window['resizeFn']()
      })
      .catch(err => {
        console.error(`Failed to validate document: ${err}`)
      })
  }

  Hint = 1;
  Info = 2;
  Warning = 4;
  Error = 8;

  protected buildMonacoError (error: amf.validate.ValidationResult): any {
    let severity
    if (error.level === 'Violation') {
      severity = this.Error
    } else if (error.level === 'Warning') {
      severity = this.Warning
    } else {
      severity = this.Info
    }
    return {
      severity: severity,
      startLineNumber: error.position.start.line,
      startColumn: error.position.start.column,
      endLineNumber: error.position.end.line,
      endColumn: error.position.end.column,
      message: error.message
    }
  }
}
