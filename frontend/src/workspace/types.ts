export interface WorkspaceWidget {
  id: string
  component: string
  props: Record<string, unknown>
  colSpan?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12
  minHeight?: number
}

export interface WorkspaceDocument {
  threadId: string
  title: string
  subtitle?: string
  updatedAt: number
  widgets: WorkspaceWidget[]
}
