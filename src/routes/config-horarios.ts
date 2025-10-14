import express from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

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

// Middleware para verificar admin
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ message: 'Se requieren permisos de administrador' })
  }
  next()
}

// Crear horarios por defecto
const crearHorariosPorDefecto = async () => {
  try {
    const horariosExistentes = await prisma.configHorario.findMany()
    
    if (horariosExistentes.length === 0) {
      await prisma.configHorario.createMany({
        data: [
          {
            nombre: 'CAS',
            descripcion: 'Contrato Administrativo de Servicios',
            entradaManana: '08:00',
            salidaManana: '13:00',
            entradaTarde: '15:00',
            salidaTarde: '18:00',
            tolerancia: 15
          },
          {
            nombre: 'Practicante CAS',
            descripcion: 'Practicante con contrato CAS',
            entradaManana: '08:00',
            salidaManana: '13:00',
            entradaTarde: '15:00',
            salidaTarde: '18:00',
            tolerancia: 15
          }
        ]
      })
      console.log('✅ Configuración de horarios por defecto creada')
    }
  } catch (error) {
    console.error('Error creando horarios por defecto:', error)
  }
}

crearHorariosPorDefecto()

// Obtener todos los horarios configurados
router.get('/', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const horarios = await prisma.configHorario.findMany({
      orderBy: { nombre: 'asc' }
    })
    res.json(horarios)
  } catch (error) {
    console.error('Error obteniendo horarios:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Obtener un horario específico
router.get('/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const horario = await prisma.configHorario.findUnique({
      where: { id: req.params.id }
    })

    if (!horario) {
      return res.status(404).json({ message: 'Horario no encontrado' })
    }

    res.json(horario)
  } catch (error) {
    console.error('Error obteniendo horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Crear nuevo horario
router.post('/', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { nombre, descripcion, entradaManana, salidaManana, entradaTarde, salidaTarde, tolerancia } = req.body

    // Validar campos requeridos
    if (!nombre || !entradaManana || !salidaManana) {
      return res.status(400).json({ message: 'Nombre, entrada mañana y salida mañana son requeridos' })
    }

    // Verificar si ya existe un horario con ese nombre
    const existe = await prisma.configHorario.findUnique({
      where: { nombre: nombre }
    })

    if (existe) {
      return res.status(400).json({ message: 'Ya existe un horario con ese nombre' })
    }

    const horario = await prisma.configHorario.create({
      data: {
        nombre,
        descripcion,
        entradaManana,
        salidaManana,
        entradaTarde: entradaTarde || null,
        salidaTarde: salidaTarde || null,
        tolerancia: tolerancia || 15
      }
    })

    res.json({ message: 'Horario creado correctamente', horario })
  } catch (error) {
    console.error('Error creando horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Actualizar horario
router.put('/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { nombre, descripcion, entradaManana, salidaManana, entradaTarde, salidaTarde, tolerancia, activo } = req.body

    const horario = await prisma.configHorario.update({
      where: { id: req.params.id },
      data: {
        nombre,
        descripcion,
        entradaManana,
        salidaManana,
        entradaTarde: entradaTarde || null,
        salidaTarde: salidaTarde || null,
        tolerancia,
        activo
      }
    })

    res.json({ message: 'Horario actualizado correctamente', horario })
  } catch (error) {
    console.error('Error actualizando horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Eliminar horario (solo si no tiene empleados asignados)
router.delete('/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    // Verificar si hay empleados usando este horario
    const empleadosConHorario = await prisma.empleado.count({
      where: { tipoHorario: req.params.id }
    })

    if (empleadosConHorario > 0) {
      return res.status(400).json({ 
        message: 'No se puede eliminar el horario porque tiene empleados asignados' 
      })
    }

    await prisma.configHorario.delete({
      where: { id: req.params.id }
    })

    res.json({ message: 'Horario eliminado correctamente' })
  } catch (error) {
    console.error('Error eliminando horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router