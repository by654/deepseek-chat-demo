/** 导出前脱敏：API Key、Bearer 凭证、邮箱、手机号与身份证号。 */
export const redactText = (text: string): string =>
  text
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, (match) => `${match.slice(0, 5)}****${match.slice(-2)}`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer ****')
    .replace(
      /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
      (_match, first: string, domain: string) => `${first}***@${domain}`
    )
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, (match) => `${match.slice(0, 3)}****${match.slice(-4)}`)
    .replace(/\b\d{17}[\dXx]\b/g, '******************')

export const redactionSummary = '已自动遮蔽 API Key、Bearer 凭证、邮箱、手机号与身份证号。'
