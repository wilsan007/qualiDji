import { describe, it, expect } from 'vitest'
import { passwordIssue, MIN_PASSWORD_LENGTH } from '@/lib/password'

describe('choix du mot de passe', () => {
  it('refuse un mot de passe trop court', () => {
    expect(passwordIssue('court', 'court')).toMatch(String(MIN_PASSWORD_LENGTH))
  })
  it('refuse une confirmation différente', () => {
    expect(passwordIssue('x'.repeat(MIN_PASSWORD_LENGTH), 'y'.repeat(MIN_PASSWORD_LENGTH))).toMatch(/ne correspondent pas/)
  })
  it('accepte un mot de passe assez long et confirmé', () => {
    expect(passwordIssue('x'.repeat(MIN_PASSWORD_LENGTH), 'x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })
})
