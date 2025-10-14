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

// Obtener configuración de horario
const obtenerConfigHorario = async (tipoHorario: string) => {
  try {
    const config = await prisma.configHorario.findUnique({
      where: { nombre: tipoHorario }
    })

    if (!config) {
      // Si no encuentra la configuración, usar valores por defecto para CAS
      return {
        entradaManana: '08:00',
        salidaManana: '13:00',
        entradaTarde: '15:00',
        salidaTarde: '18:00',
        tolerancia: 15
      }
    }

    return config
  } catch (error) {
    console.error('Error obteniendo configuración de horario:', error)
    // Valores por defecto en caso de error
    return {
      entradaManana: '08:00',
      salidaManana: '13:00',
      entradaTarde: '15:00',
      salidaTarde: '18:00',
      tolerancia: 15
    }
  }
}

// Determinar tardanza basado en configuración de horario
const determinarTardanza = async (horaEntrada: Date, tipoHorario: string): Promise<{ esTardanza: boolean; mensaje: string }> => {
  const config = await obtenerConfigHorario(tipoHorario)
  
  const hora = horaEntrada.getHours()
  const minutos = horaEntrada.getMinutes()
  const horaCompleta = hora * 60 + minutos

  // Convertir horarios de configuración a minutos
  const [horaEntradaManana, minutoEntradaManana] = config.entradaManana.split(':').map(Number)
  const limiteManana = horaEntradaManana * 60 + minutoEntradaManana + config.tolerancia

  // Verificar si es tardanza en la mañana
  if (horaCompleta > limiteManana) {
    // Verificar si todavía está en horario de mañana (antes del horario de tarde)
    let limiteMaximoManana = 13 * 60 + 59 // 13:59 como máximo para mañana
    
    if (config.entradaTarde) {
      const [horaEntradaTarde] = config.entradaTarde.split(':').map(Number)
      limiteMaximoManana = horaEntradaTarde * 60 - 1 // Un minuto antes del horario de tarde
    }

    if (horaCompleta <= limiteMaximoManana) {
      return { 
        esTardanza: true, 
        mensaje: `Tardanza en horario de mañana. Límite: ${config.entradaManana} + ${config.tolerancia}min` 
      }
    }
  }

  // Si tiene horario de tarde, verificar tardanza en la tarde
  if (config.entradaTarde) {
    const [horaEntradaTarde, minutoEntradaTarde] = config.entradaTarde.split(':').map(Number)
    const limiteTarde = horaEntradaTarde * 60 + minutoEntradaTarde + config.tolerancia

    if (horaCompleta > limiteTarde) {
      return { 
        esTardanza: true, 
        mensaje: `Tardanza en horario de tarde. Límite: ${config.entradaTarde} + ${config.tolerancia}min` 
      }
    }
  }

  return { 
    esTardanza: false, 
    mensaje: `A tiempo. Horario: ${config.entradaManana} - ${config.salidaManana}${config.entradaTarde ? ` / ${config.entradaTarde} - ${config.salidaTarde}` : ''}` 
  }
}

// Determinar si es falta (más de 1 hora de tardanza)
const determinarFalta = async (horaEntrada: Date, tipoHorario: string): Promise<boolean> => {
  const config = await obtenerConfigHorario(tipoHorario)
  
  const hora = horaEntrada.getHours()
  const minutos = horaEntrada.getMinutes()
  const horaCompleta = hora * 60 + minutos

  // Convertir horarios de configuración a minutos
  const [horaEntradaManana, minutoEntradaManana] = config.entradaManana.split(':').map(Number)
  const limiteFaltaManana = horaEntradaManana * 60 + minutoEntradaManana + config.tolerancia + 60 // 1 hora después del límite

  // Verificar falta en la mañana
  if (horaCompleta > limiteFaltaManana) {
    let limiteMaximoManana = 13 * 60 + 59 // 13:59 como máximo para mañana
    
    if (config.entradaTarde) {
      const [horaEntradaTarde] = config.entradaTarde.split(':').map(Number)
      limiteMaximoManana = horaEntradaTarde * 60 - 1
    }

    if (horaCompleta <= limiteMaximoManana) {
      return true
    }
  }

  // Verificar falta en la tarde
  if (config.entradaTarde) {
    const [horaEntradaTarde, minutoEntradaTarde] = config.entradaTarde.split(':').map(Number)
    const limiteFaltaTarde = horaEntradaTarde * 60 + minutoEntradaTarde + config.tolerancia + 60

    if (horaCompleta > limiteFaltaTarde) {
      return true
    }
  }

  return false
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

    // Determinar estado basado en el horario
    const ahora = new Date()
    const horaEntrada = ahora.toTimeString().split(' ')[0]
    
    const { esTardanza, mensaje } = await determinarTardanza(ahora, empleado.tipoHorario)
    const esFalta = await determinarFalta(ahora, empleado.tipoHorario)

    let estado = 'presente'
    if (esFalta) {
      estado = 'falta'
    } else if (esTardanza) {
      estado = 'tardanza'
    }

    const asistencia = await prisma.asistencia.create({
      data: {
        empleadoId: empleado.id,
        fecha: new Date(),
        horaEntrada: horaEntrada,
        fotoEntrada: foto,
        tardanza: esTardanza,
        faltante: esFalta,
        estado: estado
      }
    })

    // Obtener configuración para mostrar en respuesta
    const configHorario = await obtenerConfigHorario(empleado.tipoHorario)

    res.json({ 
      message: 'Asistencia registrada correctamente', 
      asistencia: {
        ...asistencia,
        empleado: {
          nombre: empleado.nombre,
          apellido: empleado.apellido,
          tipoHorario: empleado.tipoHorario
        },
        detalleHorario: {
          configuracion: configHorario,
          mensaje: mensaje
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