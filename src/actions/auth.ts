'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getCurrentUser, getRequestOrigin } from '@/lib/auth'
import { safeConnectPath } from '@/lib/connect-path'
import { getPayloadClient } from '@/lib/payload'
import { checkRate, rateLimitIP } from '@/lib/rate-limit'

export type FormState = {
  error?: string
  success?: boolean
  values?: Record<string, string>
}

const errorMessage = (err: unknown, fallback: string) => {
  const errors = (err as { data?: { errors?: { field?: string; message?: string }[] } })?.data
    ?.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    if (first.field === 'username') {
      return first.message?.startsWith('Username must')
        ? first.message
        : 'That username is unavailable.'
    }
    if (first.field === 'email') return 'An account with that email already exists.'
    return first.message || fallback
  }
  return fallback
}

const setAuthCookie = async (token: string, exp?: number, remember = true) => {
  const store = await cookies()
  store.set('payload-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    // Without an expiry the browser drops the cookie when it closes — that is
    // the "don't remember me" path.
    expires: remember && exp ? new Date(exp * 1000) : undefined,
  })
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const payload = await getPayloadClient()
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const values = { email, password }

  if (!email || !password) return { error: 'Email and password are required.', values }
  if (!(await rateLimitIP('login', 10, 60_000))) {
    return { error: 'Too many attempts. Try again in a minute.', values }
  }

  try {
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    if (result.token) {
      await setAuthCookie(result.token, result.exp, formData.get('remember') === 'on')
    }
  } catch {
    return { error: 'Invalid email or password.', values }
  }

  // `next` only ever points back into the connect flow — anything else is
  // dropped so it can't become an open redirect.
  redirect(safeConnectPath(formData.get('next')) ?? '/home')
}

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const payload = await getPayloadClient()
  const name = String(formData.get('name') ?? '').trim()
  const username = String(formData.get('username') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const values = { name, username, email, password, confirmPassword }

  if (!name || !username || !email || !password) {
    return { error: 'All fields are required.', values }
  }
  if (formData.get('agreeTerms') !== 'on') {
    return {
      error: 'You need to agree to the Terms of Service and Privacy Policy to continue.',
      values,
    }
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.', values }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.', values }
  }
  if (!(await rateLimitIP('register', 10, 60_000))) {
    return { error: 'Too many attempts. Try again in a minute.', values }
  }

  try {
    await payload.create({
      collection: 'users',
      data: { name, username, email, password, role: 'user' },
      context: { baseUrl: await getRequestOrigin() },
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not create your account.'), values }
  }

  try {
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    if (result.token) await setAuthCookie(result.token, result.exp)
  } catch {
    redirect('/login')
  }

  // A connect invite carries the pending path through onboarding so the new
  // account lands back on /connect/<username> and auto-connects.
  const next = safeConnectPath(formData.get('next'))
  redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding')
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Email is required.' }

  const payload = await getPayloadClient()

  // Per-IP AND per-address — a distributed attacker shouldn't be able to
  // spam one inbox. Report success either way to avoid leaking the limit.
  if (
    !(await rateLimitIP('forgot', 5, 60_000)) ||
    !checkRate(`forgot:${email.toLowerCase()}`, 3, 15 * 60_000)
  ) {
    return { success: true }
  }

  try {
    await payload.forgotPassword({
      collection: 'users',
      data: { email },
      context: { baseUrl: await getRequestOrigin() },
    })
  } catch (err) {
    payload.logger.error({ err, msg: 'Failed to send password reset email' })
  }

  // Always report success so the response doesn't reveal whether the email
  // is registered (payload.forgotPassword itself fails silently for unknown
  // emails).
  return { success: true }
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const values = { token }

  if (!token) return { error: 'That reset link is invalid. Request a new one.' }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.', values }
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.', values }
  }

  const payload = await getPayloadClient()

  try {
    const result = await payload.resetPassword({
      collection: 'users',
      data: { password, token },
      overrideAccess: true,
    })
    if (result.token) await setAuthCookie(result.token)
  } catch {
    return { error: 'That reset link is invalid or has expired. Request a new one.', values }
  }

  redirect('/home')
}

export async function checkUsername(username: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return false
  if (!(await rateLimitIP('check-username', 20, 60_000))) return false
  const payload = await getPayloadClient()
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: { username: { equals: username } },
  })
  return totalDocs === 0
}

export async function logout() {
  const store = await cookies()
  store.delete('payload-token')
  redirect('/login')
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const currentPassword = String(formData.get('currentPassword') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')

  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' }
  }

  const payload = await getPayloadClient()

  try {
    await payload.login({
      collection: 'users',
      data: { email: user.email, password: currentPassword },
    })
  } catch {
    return { error: 'Current password is incorrect.' }
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: { password: newPassword },
    user,
    overrideAccess: false,
  })

  return { success: true }
}
