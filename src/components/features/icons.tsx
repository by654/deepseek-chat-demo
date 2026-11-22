import type { SVGProps } from 'react'

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    {children}
  </svg>
)

export const IconArchiveOutline16 = () => (
  <Icon>
    <path d="M4 7h16v13H4z" />
    <path d="M3 4h18v3H3z" />
    <path d="M10 11h4" />
  </Icon>
)

export const IconFolderOutline16 = () => (
  <Icon>
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
)

export const IconTagOutline16 = () => (
  <Icon>
    <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.2" />
  </Icon>
)

export const IconPinOutline16 = () => (
  <Icon>
    <path d="M9 4h6l-1 6 3 3H7l3-3z" />
    <path d="M12 13v7" />
  </Icon>
)

export const IconStarOutline16 = () => (
  <Icon>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </Icon>
)

export const IconStarFill16 = () => (
  <Icon fill="currentColor" stroke="none">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </Icon>
)

export const IconTemplateOutline16 = () => (
  <Icon>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </Icon>
)

export const IconSnapshotOutline16 = () => (
  <Icon>
    <path d="M4 7h4l2-2h4l2 2h4v12H4z" />
    <circle cx="12" cy="13" r="3.2" />
  </Icon>
)

export const IconRestoreOutline16 = () => (
  <Icon>
    <path d="M4 9a8 8 0 1 1 2.3 7" />
    <path d="M4 4v5h5" />
  </Icon>
)

export const IconCommandOutline16 = () => (
  <Icon>
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
  </Icon>
)

export const IconTableOutline16 = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 10v10M15 10v10" />
  </Icon>
)

export const IconAudioOutline16 = () => (
  <Icon>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </Icon>
)

export const IconPlayOutline16 = () => (
  <Icon>
    <path d="M8 5v14l11-7z" />
  </Icon>
)

export const IconLockOutline16 = () => (
  <Icon>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
)

export const IconLibraryOutline16 = () => (
  <Icon>
    <path d="M4 4h5v16H4zM10 4h5v16h-5zM17 5l3 15" />
  </Icon>
)

export const IconWorkspaceOutline16 = () => (
  <Icon>
    <rect x="3" y="4" width="8" height="7" rx="1.5" />
    <rect x="13" y="4" width="8" height="7" rx="1.5" />
    <rect x="3" y="13" width="8" height="7" rx="1.5" />
    <rect x="13" y="13" width="8" height="7" rx="1.5" />
  </Icon>
)

export const IconCompareOutline16 = () => (
  <Icon>
    <path d="M12 4v16" />
    <path d="M5 7h4M5 11h4M15 7h4M15 11h4" />
    <path d="M5 16h4M15 16h4" />
  </Icon>
)

export const IconArrowUpOutline14 = () => (
  <Icon width="14" height="14">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
)

export const IconArrowDownOutline14 = () => (
  <Icon width="14" height="14">
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
)

export const IconSparkleOutline16 = () => (
  <Icon>
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </Icon>
)

export const IconBookmarkOutline16 = () => (
  <Icon>
    <path d="M6 4h12v17l-6-4-6 4z" />
  </Icon>
)

export const IconSnippetOutline16 = () => (
  <Icon>
    <path d="M8 6 3 12l5 6M16 6l5 6-5 6M14 4l-4 16" />
  </Icon>
)

export const IconSearchOutline16 = () => (
  <Icon>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icon>
)

export const IconTrashOutline16 = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    <path d="M10 11v5M14 11v5" />
  </Icon>
)

export const IconDownloadOutline16 = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </Icon>
)
