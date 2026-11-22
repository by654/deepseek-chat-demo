import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** 单组件异常不白屏：展示恢复入口，避免整页不可用。 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ui] render failed', error, info.componentStack)
  }

  override render() {
    if (!this.state.error) {
      return this.props.children
    }
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          height: '100%',
          padding: 24,
          color: 'var(--ui-text-1)',
          background: 'var(--ui-bg-canvas)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700 }}>界面出现异常</div>
        <div style={{ color: 'var(--ui-text-2)', fontSize: 13, maxWidth: 420 }}>
          你的会话仍然保存在本机。可以重新加载，或先返回欢迎页继续使用。
        </div>
        <pre
          style={{
            maxWidth: 'min(560px, 100%)',
            overflow: 'auto',
            padding: 10,
            borderRadius: 8,
            background: 'var(--ui-bg-surface)',
            color: 'var(--ui-danger)',
            fontSize: 11,
            textAlign: 'left',
          }}
        >
          {this.state.error.message}
        </pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              window.location.hash = ''
              window.location.reload()
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: '1px solid var(--ui-brand-border)',
              background: 'var(--ui-brand)',
              color: 'var(--ui-on-brand)',
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: '1px solid var(--ui-border)',
              background: 'var(--ui-bg-surface)',
              color: 'var(--ui-text-1)',
              cursor: 'pointer',
            }}
          >
            恢复界面
          </button>
        </div>
      </div>
    )
  }
}
