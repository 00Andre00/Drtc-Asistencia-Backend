import { Request } from 'express'

declare module 'express' {
  interface Request {
    user?: {
      id: string
      dni: string
      nombre: string
      esAdmin: boolean
      iat?: number
      exp?: number
    }
  }
}