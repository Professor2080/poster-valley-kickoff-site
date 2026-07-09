import { featuredDrop, getDropByHref } from '../data/drops'

export const routes = {
  home: '/',
  firstDrop: featuredDrop.href,
  firstDropInterest: `${featuredDrop.href}#drop-interest`,
  privacy: '/privacy',
  order: '/order',
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

export function getOrderTokenRoute(pathname: string) {
  const match = pathname.match(/^\/order\/([A-Za-z0-9_-]{24,160})$/)
  return match?.[1] ?? null
}
