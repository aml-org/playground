export abstract class CommonViewModel {
  public highlightError (message: string, editor: any) {
    const model = editor.getModel()
    const range = model.getFullModelRange()
    range.severity = monaco.MarkerSeverity.Error
    range.message = message
    monaco.editor.setModelMarkers(model, model.id, [range])
  }

  public clearErrorsHighlight (editor: any) {
    const model = editor.getModel()
    monaco.editor.setModelMarkers(model, model.id, [])
  }
}
