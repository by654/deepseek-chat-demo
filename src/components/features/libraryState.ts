import { create } from 'zustand'

export type LibraryTab = 'stars' | 'templates' | 'personas' | 'snippets' | 'workspaces' | 'folders'

type LibraryState = {
  open: boolean
  tab: LibraryTab
}

export const useLibraryDialog = create<LibraryState>(() => ({ open: false, tab: 'stars' }))

export const openLibrary = (tab: LibraryTab = 'stars') =>
  useLibraryDialog.setState({ open: true, tab })

export const closeLibrary = () => useLibraryDialog.setState({ open: false })
