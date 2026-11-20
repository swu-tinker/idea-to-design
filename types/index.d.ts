// The values this plugin keeps in $.state.

// The newest run's pipeline.md, or null when there is none to show.
export type PipelineFile = {
  path: string
  slug: string
  mtimeMs: number
  text: string
} | null

declare module 'claude-code' {
  interface PluginState {
    'idea-to-design': { pipeline: Shaped<PipelineFile> }
  }
}
