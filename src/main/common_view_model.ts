export abstract class CommonViewModel {
  // Highlights global errors without a particular location in an AML file
  public highlightGlobalError (message: string, editor: any) {
    const model = editor.getModel()
    const range = model.getFullModelRange()
    range.severity = globalThis.monaco.MarkerSeverity.Error
    range.message = message
    globalThis.monaco.editor.setModelMarkers(model, model.id, [range])
  }

  // Cleart errors highlights in editor
  public clearErrorsHighlight (editor: any) {
    const model = editor.getModel()
    globalThis.monaco.editor.setModelMarkers(model, model.id, [])
  }
}
