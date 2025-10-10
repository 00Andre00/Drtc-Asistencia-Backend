import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

// Extender el tipo Request
declare module 'express' {
  interface Request {
    user?: any
  }
}

const router = express.Router()

// Configuración multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'asistencia-' + uniqueSuffix + '.jpg')
  }
})

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
})

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

// Buscar empleado (sin crear automáticamente)
const buscarEmpleado = async (dni: string) => {
  const empleado = await prisma.empleado.findUnique({
    where: { dni: dni }
  })

  if (!empleado) {
    throw new Error('Empleado no registrado. Contacte al administrador.')
  }

  return empleado
}

// Determinar tardanza basado en tipo de horario
const determinarTardanza = (horaEntrada: Date, tipoHorario: string): boolean => {
  const hora = horaEntrada.getHours()
  const minutos = horaEntrada.getMinutes()
  
  // Límites de tardanza por tipo de horario
  const limites = {
    matutino: { hora: 7, minutos: 15 }, // 7:15 AM
    vespertino: { hora: 15, minutos: 15 }, // 3:15 PM
    nocturno: { hora: 23, minutos: 15 }, // 11:15 PM
    administrativo: { hora: 8, minutos: 15 }, // 8:15 AM
    flexible: { hora: 6, minutos: 15 } // 6:15 AM
  }

  const limite = limites[tipoHorario as keyof typeof limites] || limites.administrativo
  
  // Convertir a minutos para comparación
  const entradaMinutos = hora * 60 + minutos
  const limiteMinutos = limite.hora * 60 + limite.minutos
  
  return entradaMinutos > limiteMinutos
}

// Marcar entrada
router.post('/entrada', authenticate, upload.single('foto'), async (req: express.Request, res: express.Response) => {
  try {
    const { dni } = req.body
    const foto = req.file ? `/uploads/${req.file.filename}` : null

    if (!dni || dni.length !== 8) {
      return res.status(400).json({ message: 'DNI debe tener 8 dígitos' })
    }

    // Buscar empleado (sin crear automáticamente)
    const empleado = await buscarEmpleado(dni)

    // Verificar si ya marcó entrada hoy
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const mañana = new Date(hoy)
    mañana.setDate(hoy.getDate() + 1)

    const yaRegistrado = await prisma.asistencia.findFirst({
      where: {
        empleadoId: empleado.id,
        fecha: {
          gte: hoy,
          lt: mañana
        }
      }
    })

    if (yaRegistrado) {
      return res.status(400).json({ message: 'Ya registró entrada hoy' })
    }

    // Determinar si es tardanza basado en el tipo de horario
    const ahora = new Date()
    const horaEntrada = ahora.toTimeString().split(' ')[0]
    
    const esTardanza = determinarTardanza(ahora, empleado.tipoHorario || 'administrativo')

    const asistencia = await prisma.asistencia.create({
      data: {
        empleadoId: empleado.id,
        fecha: new Date(),
        horaEntrada: horaEntrada,
        fotoEntrada: foto,
        tardanza: esTardanza,
        faltante: false,
        estado: esTardanza ? 'tardanza' : 'presente'
      }
    })

    res.json({ 
      message: 'Asistencia registrada correctamente', 
      asistencia: {
        ...asistencia,
        empleado: {
          nombre: empleado.nombre,
          apellido: empleado.apellido,
          tipoHorario: empleado.tipoHorario
        }
      }
    })
  } catch (error: any) {
    console.error('Error al registrar entrada:', error)
    res.status(500).json({ message: error.message || 'Error al registrar asistencia' })
  }
})

// Marcar salida
router.post('/salida', authenticate, async (req: express.Request, res: express.Response) => {
  try {
    const { dni, motivo } = req.body

    if (!dni || dni.length !== 8) {
      return res.status(400).json({ message: 'DNI debe tener 8 dígitos' })
    }

    if (!motivo) {
      return res.status(400).json({ message: 'Motivo es requerido' })
    }

    // Buscar empleado
    const empleado = await buscarEmpleado(dni)

    const papeleta = await prisma.papeleta.create({
      data: {
        empleadoId: empleado.id,
        fecha: new Date(),
        tipo: 'permiso',
        motivo: motivo,
        aprobado: true
      }
    })

    res.json({ 
      message: 'Salida registrada correctamente', 
      papeleta: {
        ...papeleta,
        empleado: {
          nombre: empleado.nombre,
          apellido: empleado.apellido
        }
      }
    })
  } catch (error: any) {
    console.error('Error al registrar salida:', error)
    res.status(500).json({ message: error.message || 'Error al registrar salida' })
  }
})

export default router