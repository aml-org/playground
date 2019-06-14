export function label (uri: string): string {
  if (uri.indexOf('#') > -1) {
    const hashPart = uri.split('#')[1]
    const base = uri.split('#')[0]
    return '/' + base.split('/').pop() + '#' + hashPart
  } else {
    return ('/' + uri.split('/').pop()) || uri
  }
}
