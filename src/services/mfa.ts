import { supabase } from './supabase/client.js'

export type MfaFactor = {
  id: string
  friendlyName: string
  status: string
  createdAt: string
}

export type EnrollResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; reason: 'disabled' | 'failed' }

const isMfaDisabled = (message: string) => {
  const lower = message.toLowerCase()
  return (
    lower.includes('mfa is not enabled') ||
    lower.includes('totp is not enabled') ||
    lower.includes('factor type is not enabled')
  )
}

/** 当前账号已绑定的验证器 */
export const listMfaFactors = async (): Promise<MfaFactor[]> => {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      return []
    }
    return (data?.all ?? [])
      .filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
      .map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name ?? '',
        status: factor.status,
        createdAt: factor.created_at,
      }))
  } catch {
    return []
  }
}

/** 开始绑定：返回二维码（SVG data URI）与手动输入密钥 */
export const enrollTotp = async (friendlyName = '验证器'): Promise<EnrollResult> => {
  try {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    })
    if (error) {
      return { ok: false, reason: isMfaDisabled(error.message) ? 'disabled' : 'failed' }
    }
    if (!data?.totp?.qr_code || !data.totp.secret) {
      return { ok: false, reason: 'failed' }
    }
    return {
      ok: true,
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** 用 6 位验证码完成绑定；成功后该 factor 变为 verified */
export const verifyTotpEnrollment = async (factorId: string, code: string): Promise<boolean> => {
  try {
    const challenge = await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error || !challenge.data) {
      return false
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    })
    return !error
  } catch {
    return false
  }
}

/** 已绑定状态下再次校验（用于登录后的 AAL2 门禁） */
export const verifyTotp = async (factorId: string, code: string): Promise<boolean> =>
  verifyTotpEnrollment(factorId, code)

export const unenrollTotp = async (factorId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    return !error
  } catch {
    return false
  }
}

/** 是否需要升级到 AAL2：已绑定验证器且本次登录尚未校验 */
export const needsMfaChallenge = async (): Promise<{ required: boolean; factorId: string | null }> => {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!data) {
      return { required: false, factorId: null }
    }
    if (data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') {
      return { required: false, factorId: null }
    }
    const factors = await listMfaFactors()
    return { required: factors.length > 0, factorId: factors[0]?.id ?? null }
  } catch {
    return { required: false, factorId: null }
  }
}
