export type Mood = 'normal' | 'happy' | 'angry' | 'foot'
export type Tally = { edits: number; commands: number; failures: number; blocked: number }

declare module 'claude-code' {
  interface PluginState {
    yujie: { mood: Mood; line: string; tally: Tally; isDialect: boolean }
  }
}
