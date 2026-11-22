import { create } from 'zustand'

type CommandPaletteState = {
  open: boolean
}

export const useCommandPalette = create<CommandPaletteState>(() => ({ open: false }))

export const openCommandPalette = () => useCommandPalette.setState({ open: true })
export const closeCommandPalette = () => useCommandPalette.setState({ open: false })

type CompareState = {
  open: boolean
  prompt: string
}

export const useCompareDialog = create<CompareState>(() => ({ open: false, prompt: '' }))

export const openCompareDialog = (prompt = '') =>
  useCompareDialog.setState({ open: true, prompt })
export const closeCompareDialog = () => useCompareDialog.setState({ open: false })
