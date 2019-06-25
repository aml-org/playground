import * as ko from 'knockout'
import * as amf from 'amf-client-js'
import { CommonViewModel } from '../main/common_view_model'

const Vocabularies = amf.plugins.document.Vocabularies

export class ViewModel extends CommonViewModel {
  public dialectModel: any | null = null;
  public documentModel: any | null = null;

  public changesFromLastUpdate = 0;
  public someModelChanged = false;
  public RELOAD_PERIOD = 1000;

  public amlParser?
  public profileName: amf.ProfileName;

  public base = window.location.href.toString().split('/validation.html')[0]
  public defaultDocUrl = 'http://a.ml/amf/default_document'

  public constructor (public dialectEditor: any, public documentEditor: any) {
    super()

    this.amlParser = new amf.Aml10Parser()

    this.documentEditor.onDidChangeModelContent(() => {
      this.handleModelContentChange(() => {
        this.clearErrorsHighlight(this.documentEditor)
        this.updateDocumentEditorContent()
      })
    })
    this.dialectEditor.onDidChangeModelContent(() => {
      this.handleModelContentChange(() => {
        this.clearErrorsHighlight(this.dialectEditor)
        return this.updateDialectEditorContent()
      })
    })
  }

  public apply () {
    window['viewModel'] = this
    ko.applyBindings(this)
    return amf.AMF.init()
  }

  public createModel (text, mode) {
    return window['monaco'].editor.createModel(text, mode)
  }

  public loadInitialDialect () {
    const params = new URLSearchParams(window.location.search)
    let value = params.get('dialect')
    if (!value) {
      return this.loadDialectFromUrl(
        `${this.base}/examples/pods/dialect.yaml`)
    }
    try {
      new URL(value) // Try to wrap it in URL to see if it's actually a url
      return this.loadDialectFromUrl(value.trim())
    } catch (e) {
      // Query param value is an AML file content
      try { value = decodeURIComponent(value) } catch (err) {}
      this.dialectEditor.setValue(value.trim())
      this.changesFromLastUpdate = 0
      this.someModelChanged = false
      return this.updateDialectEditorContent()
        .catch(err => {
          this.highlightError(
            `Failed to load AML from query string: ${err}`,
            this.dialectEditor)
        })
    }
  }

  public loadInitialDocument () {
    const params = new URLSearchParams(window.location.search)
    let value = params.get('document')
    if (!value) {
      return this.loadDocumentFromUrl(
        `${this.base}/examples/pods/document.yaml`)
    }
    try {
      new URL(value) // Try to wrap it in URL to see if it's actually a url
      return this.loadDocumentFromUrl(value.trim())
    } catch (e) {
      // Query param value is an AML file content
      try { value = decodeURIComponent(value) } catch (err) {}
      this.documentEditor.setValue(value.trim())
      this.changesFromLastUpdate = 0
      this.someModelChanged = false
      return this.updateDocumentEditorContent()
        .catch(err => {
          this.highlightError(
            `Failed to load AML from query string: ${err}`,
            this.documentEditor)
        })
    }
  }

  public handleModelContentChange (parsingFn) {
    this.changesFromLastUpdate++
    this.someModelChanged = true;
    ((number) => {
      setTimeout(() => {
        if (this.changesFromLastUpdate === number) {
          this.changesFromLastUpdate = 0
          this.someModelChanged = false
          parsingFn.call(this)
        }
      }, this.RELOAD_PERIOD)
    })(this.changesFromLastUpdate)
  }

  public loadDialectFromUrl (dialectPath) {
    this.changesFromLastUpdate = 0
    return this.amlParser.parseFileAsync(dialectPath)
      .then(model => {
        if (this.dialectModel === null) {
          this.dialectEditor.setModel(this.createModel(model.raw, 'aml'))
        }
        this.dialectModel = model
        return this.registerDialectEditorContent()
      })
  }

  public updateDialectEditorContent () {
    const editorValue = this.dialectEditor.getValue()
    if (!editorValue) {
      return
    }
    return this.amlParser.parseStringAsync(editorValue)
      .then(model => {
        if (this.dialectModel === null) {
          this.dialectEditor.setModel(this.createModel(model.raw, 'aml'))
        }
        this.dialectModel = model
        return this.registerDialectEditorContent()
      })
      .catch((err) => {
        this.highlightError(
          `Failed to parse dialect: ${err}`,
          this.dialectEditor)
      })
  }

  public registerDialectEditorContent () {
    const editorValue = this.dialectEditor.getValue()
    const location = this.dialectModel.location
    return Vocabularies.registerDialect(location, editorValue)
      .then(dialect => {
        this.profileName = new amf.ProfileName(dialect.nameAndVersion())

        // It's necessary to re-parse document in terms of new dialect to
        // make validation work.
        return this.updateDocumentEditorContent()
      })
  }

  public loadDocumentFromUrl (documentPath) {
    this.changesFromLastUpdate = 0
    return this.amlParser.parseFileAsync(documentPath)
      .then(model => {
        if (this.documentModel === null) {
          this.documentEditor.setModel(this.createModel(model.raw, 'aml'))
        }
        this.documentModel = model
        this.doValidate()
      })
  }

  public updateDocumentEditorContent () {
    const editorValue = this.documentEditor.getValue()
    if (!editorValue) {
      return
    }
    return this.amlParser.parseStringAsync(editorValue)
      .then(model => {
        if (this.documentModel === null) {
          this.documentEditor.setModel(
            this.createModel(model.raw || editorValue, 'aml'))
        }
        this.documentModel = model
        this.doValidate()
      })
      .catch((err) => {
        this.highlightError(
          `Failed to parse document: ${err}`,
          this.documentEditor)
      })
  }

  public doValidate () {
    if (this.dialectModel === null || this.documentModel === null) {
      return
    }
    amf.AMF.validate(this.documentModel, this.profileName, amf.MessageStyles.RAML)
      .then(report => {
        const monacoErrors = report.results.map((result) => {
          return this.buildMonacoError(result)
        })
        const model = this.documentEditor.getModel()
        monaco.editor.setModelMarkers(model, model.id, monacoErrors)
        window['resizeFn']()
      })
      .catch(err => {
        this.highlightError(
          `Failed to validate document: ${err}`,
          this.documentEditor)
      })
  }

  protected buildMonacoError (error: amf.validate.ValidationResult): any {
    let severity
    if (error.level === 'Violation') {
      severity = monaco.MarkerSeverity.Error
    } else if (error.level === 'Warning') {
      severity = monaco.MarkerSeverity.Warning
    } else {
      severity = monaco.MarkerSeverity.Info
    }
    return {
      severity: severity,
      startLineNumber: error.position.start.line,
      startColumn: error.position.start.column + 1,
      endLineNumber: error.position.end.line,
      endColumn: error.position.end.column + 1,
      message: error.message
    }
  }
}
