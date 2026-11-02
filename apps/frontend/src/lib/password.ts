/** Longueur minimale d'un mot de passe choisi par l'utilisateur (alignée sur le provisionnement des comptes de recette). */
export const MIN_PASSWORD_LENGTH = 12

/** Message d'erreur du choix de mot de passe, ou null s'il est acceptable. */
export function passwordIssue(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`
  }
  if (password !== confirmation) return 'Les deux mots de passe ne correspondent pas.'
  return null
}
