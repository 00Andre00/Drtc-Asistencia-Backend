import express from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

// Extender el tipo Request
declare module 'express' {
  interface Request {
    user?: any
  }
}

const router = express.Router()

// Middleware de autenticación
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1]
  
  if (!token) {
    return res.status(401).json({ message: 'Acceso no autorizado' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    ;(req as any).user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido' })
  }
}

// Middleware para verificar admin - CORREGIDO
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user
  
  if (!user) {
    return res.status(401).json({ message: 'Usuario no autenticado' })
  }

  // Verificar si es admin (role === 'admin')
  if (user.role !== 'admin') {
    return res.status(403).json({ message: 'Se requieren permisos de administrador' })
  }
  
  next()
}

// Obtener todos los empleados
router.get('/empleados', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const empleados = await prisma.empleado.findMany({
      orderBy: { nombre: 'asc' }
    })
    res.json(empleados)
  } catch (error) {
    console.error('Error obteniendo empleados:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Obtener todas las asistencias
router.get('/asistencias', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const asistencias = await prisma.asistencia.findMany({
      include: {
        empleado: {
          select: {
            nombre: true,
            apellido: true,
            dni: true
          }
        }
      },
      orderBy: { fecha: 'desc' }
    })
    res.json(asistencias)
  } catch (error) {
    console.error('Error obteniendo asistencias:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Obtener todas las papeletas
router.get('/papeletas', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const papeletas = await prisma.papeleta.findMany({
      include: {
        empleado: {
          select: {
            nombre: true,
            apellido: true,
            dni: true
          }
        }
      },
      orderBy: { fecha: 'desc' }
    })
    res.json(papeletas)
  } catch (error) {
    console.error('Error obteniendo papeletas:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Obtener detalle de empleado
router.get('/empleados/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const empleado = await prisma.empleado.findUnique({
      where: { id: req.params.id }
    })

    if (!empleado) {
      return res.status(404).json({ message: 'Empleado no encontrado' })
    }

    const asistencias = await prisma.asistencia.findMany({
      where: { empleadoId: req.params.id },
      orderBy: { fecha: 'desc' }
    })

    const papeletas = await prisma.papeleta.findMany({
      where: { empleadoId: req.params.id },
      orderBy: { fecha: 'desc' }
    })

    res.json({
      empleado,
      asistencias,
      papeletas
    })
  } catch (error) {
    console.error('Error obteniendo detalle empleado:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router