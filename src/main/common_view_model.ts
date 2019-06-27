export abstract class CommonViewModel {

  // Highlights global errors without a particular location in an AML file
  public highlightGlobalError (message: string, editor: any) {
    const model = editor.getModel()
    const range = model.getFullModelRange()
    range.severity = monaco.MarkerSeverity.Error
    range.message = message
    monaco.editor.setModelMarkers(model, model.id, [range])
  }

  // Cleart errors highlights in editor
  public clearErrorsHighlight (editor: any) {
    const model = editor.getModel()
    monaco.editor.setModelMarkers(model, model.id, [])
  }
}
