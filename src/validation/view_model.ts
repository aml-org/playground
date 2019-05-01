import * as ko from 'knockout'
import * as amf from 'amf-client-js'
import { UI } from '../view_models/ui'
import AnyShape = amf.model.domain.AnyShape

export class ViewModel {
  public env: amf.client.environment.Environment = null;

  public errors: KnockoutObservableArray<amf.validate.ValidationResult> = ko.observableArray<amf.validate.ValidationResult>([]);
  public selectedModel: KnockoutObservable<amf.model.document.BaseUnit|null> = ko.observable(null);

  // TODO: Remove later
  public editorSection: KnockoutObservable<string> = ko.observable<string>('document');
  public validationSection: KnockoutObservable<string> = ko.observable<string>('dialect');

  public customValidation?: string;

  public errorsMapShape: {[id: string]: boolean} = {};
  public ui: UI = new UI();

  public model: any | null = null;
  public modelSyntax: string | null = null;
  public modelText: string | null = null;

  public changesFromLastUpdate = 0;
  public documentModelChanged = false;
  public RELOAD_PERIOD = 1000;

  public amlParser?
  public profilePath = 'file://PlaygroundValidationProfile.aml';
  public profileName: amf.ProfileName;

  public constructor (public dialectEditor: any, public documentEditor: any) {
    amf.AMF.init()
      .then(() => {
        this.amlParser = new amf.Aml10Parser()
        return this.parseDialectEditorContent()
      })
      .then(() => {
        return this.parseDocumentEditorContent()
      })

    this.documentEditor.onDidChangeModelContent(() => {
      this.handleModelContentChange(this.parseDocumentEditorContent)
    })
    this.dialectEditor.onDidChangeModelContent(() => {
      this.handleModelContentChange(this.parseDialectEditorContent)
    })
  }

  public handleModelContentChange (parsingFn) {
    this.changesFromLastUpdate++
    this.documentModelChanged = true;
    ((number) => {
      setTimeout(() => {
        if (this.changesFromLastUpdate === number) {
          this.changesFromLastUpdate = 0
          parsingFn()
        }
      }, this.RELOAD_PERIOD)
    })(this.changesFromLastUpdate)
  }

  public parseDialectEditorContent () {
    return amf.AMF.loadValidationProfile(this.profilePath, this.getEnv())
      .then((profileName) => {
        this.profileName = profileName
        this.doValidate()
      })
  }

  public parseDocumentEditorContent () {
    const editorValue = this.documentEditor.getValue()
    return this.amlParser.parseStringAsync(editorValue)
      .then((parsed: amf.model.document.Document) => {
        this.selectedModel(parsed)
        const oldErrors = this.errors()
        try {
          this.doValidate()
        } catch (err) {
          console.error(`Failed to parse document: ${err}`)
          this.errors(oldErrors)
        }
      })
      .catch((err) => {
        console.error(`Failed to parse document: ${err}`)
      })
  }

  public getEnv () {
    const profilePath = this.profilePath
    const EditorProfileLoader = {
      fetch: function (resource) {
        return new Promise(function (resolve, reject) {
          resolve(new amf.client.remote.Content(
            this.dialectEditor.getValue(), profilePath))
        })
      },
      accepts: function (resource) {
        return true
      }
    }
    const env = new amf.client.environment.Environment()
    return env.addClientLoader(EditorProfileLoader)
  }

  public hasError (shape: AnyShape): boolean {
    const errors = this.errorsMapShape || {}
    return errors[(shape.id || '').split('document/type')[1]] || false
  }

  public apply (location: Node) {
    window['viewModel'] = this
    ko.applyBindings(this)
  }

  public doValidate () {
    const model = this.selectedModel()
    if (model === null) {
      return
    }
    this.amlParser.reportValidation(this.profileName)
      .then((report) => {
        var violations = report.results.filter((result) => {
          return result.level === 'Violation'
        })
        const editorModel = this.documentEditor.getModel()
        const monacoErrors = report.results.map((result) => { this.buildMonacoError(result) })
        monaco.editor.setModelMarkers(editorModel, editorModel.id, monacoErrors)

        this.errors(violations)
        this.errorsMapShape = this.errors()
          .map(e => {
            return e.validationId.split('document/type')[1]
          })
          .reduce((a, s) => { a[s] = true; return a }, {})
        window['resizeFn']()
      })
      .catch((err) => {
        console.error(`Failed to validate document: ${err}`)
      })
  }

  Hint = 1;
  Info = 2;
  Warning = 4;
  Error = 8;

  protected buildMonacoError (error: amf.validate.ValidationResult): any {
    let severity = this.Info
    if (error.level === 'Violation') { severity = this.Error }
    if (error.level === 'Warning') { severity = this.Warning }
    const startLineNumber = error.position.start.line
    const startColumn = error.position.start.column
    const endLineNumber = error.position.end.line
    const endColumn = error.position.end.column
    const message = error.message
    return {
      severity, // hardcoded error severity
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
      message
    }
  }
}
