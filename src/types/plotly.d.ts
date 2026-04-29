// plotly.js-dist-min ships the full Plotly runtime but no types.
// Use the @types/plotly.js types via a re-export.
declare module 'plotly.js-dist-min' {
  import * as Plotly from 'plotly.js'
  export = Plotly
}
