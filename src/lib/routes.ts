import { firstDrop } from '../data/drops'

export const routes = {
  home: '/',
  firstDrop: firstDrop.href,
  firstDropInterest: `${firstDrop.href}#drop-interest`,
}

export function isFirstDropRoute(pathname: string) {
  return pathname === firstDrop.href
}
