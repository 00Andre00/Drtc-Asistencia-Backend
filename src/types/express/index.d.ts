import express from 'express'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        username: string
        nombre: string
        role: string
        tipo: string
        iat?: number
        exp?: number
      }
    }
  }
}