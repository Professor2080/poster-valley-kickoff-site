import { firstDrop } from '../data/drops'

export const routes = {
  home: '/',
  firstDrop: firstDrop.href,
  firstDropInterest: `${firstDrop.href}#drop-interest`,
  privacy: '/privacy',
}

export function isFirstDropRoute(pathname: string) {
  return pathname === firstDrop.href
}

export function isPrivacyRoute(pathname: string) {
  return pathname === routes.privacy
}
