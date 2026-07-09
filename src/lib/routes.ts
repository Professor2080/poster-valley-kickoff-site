import { featuredDrop, getDropByHref } from '../data/drops'

export const routes = {
  home: '/',
  firstDrop: featuredDrop.href,
  firstDropInterest: `${featuredDrop.href}#drop-interest`,
  privacy: '/privacy',
}

export function isFirstDropRoute(pathname: string) {
  return pathname === featuredDrop.href
}

export function getDropRoute(pathname: string) {
  return getDropByHref(pathname)
}

export function isPrivacyRoute(pathname: string) {
  return pathname === routes.privacy
}
