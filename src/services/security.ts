import { create } from 'zustand'
import { setHiddenUnlocked, setLockPin, useSettings } from './settings.js'

/** 本地数据锁屏与隐藏会话的 PIN 校验；只保存加盐 SHA-256，不保存明文。 */

type LockState = {
  locked: boolean
  lastActiveAt: number
}

export const useLock = create<LockState>(() => ({
  locked: false,
  lastActiveAt: Date.now(),
}))

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')

const randomSalt = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export const hashPin = async (pin: string, salt: string): Promise<string> => {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  return toHex(await crypto.subtle.digest('SHA-256', data))
}

export const setPin = async (pin: string) => {
  const salt = randomSalt()
  const hash = await hashPin(pin, salt)
  setLockPin(hash, salt)
  useLock.setState({ locked: false })
}

export const clearPin = () => {
  setLockPin(null, null)
  setHiddenUnlocked(false)
  useLock.setState({ locked: false })
}

export const hasPin = () => Boolean(useSettings.getState().lockPinHash)

export const verifyPin = async (pin: string): Promise<boolean> => {
  const { lockPinHash, lockSalt } = useSettings.getState()
  if (!lockPinHash) {
    return true
  }
  if (!lockSalt) {
    return false
  }
  return (await hashPin(pin, lockSalt)) === lockPinHash
}

export const lockNow = () => {
  if (hasPin()) {
    useLock.setState({ locked: true })
    setHiddenUnlocked(false)
  }
}

export const unlock = async (pin: string): Promise<boolean> => {
  if (!(await verifyPin(pin))) {
    return false
  }
  setHiddenUnlocked(true)
  useLock.setState({ locked: false, lastActiveAt: Date.now() })
  return true
}

export const markActive = () => useLock.setState({ lastActiveAt: Date.now() })
