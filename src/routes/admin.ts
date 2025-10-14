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

// Middleware para verificar admin
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user
  
  if (!user) {
    return res.status(401).json({ message: 'Usuario no autenticado' })
  }

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

// Verificar si un DNI ya está registrado
router.get('/empleados/verificar/:dni', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const empleado = await prisma.empleado.findUnique({
      where: { dni: req.params.dni }
    })
    res.json({ existe: !!empleado })
  } catch (error) {
    console.error('Error verificando empleado:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Consultar DNI en RENIEC
router.get('/reniec/:dni', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { dni } = req.params
    
    if (!dni || dni.length !== 8) {
      return res.status(400).json({ 
        success: false,
        message: 'DNI debe tener 8 dígitos' 
      })
    }

    // Simular consulta a RENIEC por ahora
    // En producción, reemplaza esto con tu API real
    const resultado = {
      success: true,
      data: {
        numero: dni,
        nombre_completo: 'NOMBRE COMPLETO DEL USUARIO',
        nombres: 'NOMBRES',
        apellido_paterno: 'APELLIDO PATERNO',
        apellido_materno: 'APELLIDO MATERNO',
        codigo_verificacion: '1'
      }
    }
    
    res.json(resultado)
  } catch (error: any) {
    console.error('Error consultando RENIEC:', error)
    res.status(500).json({ 
      success: false,
      message: error.message || 'Error al consultar RENIEC'
    })
  }
})

// Registrar nuevo empleado
router.post('/empleados', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { dni, nombre, apellido, departamento, puesto, tipoHorario, fechaIngreso } = req.body

    // Validaciones básicas
    if (!dni || !nombre || !apellido || !departamento || !puesto || !tipoHorario || !fechaIngreso) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' })
    }

    if (dni.length !== 8) {
      return res.status(400).json({ message: 'El DNI debe tener 8 dígitos' })
    }

    // Verificar que el DNI no exista
    const empleadoExistente = await prisma.empleado.findUnique({
      where: { dni }
    })

    if (empleadoExistente) {
      return res.status(400).json({ message: 'El DNI ya está registrado' })
    }

    const nuevoEmpleado = await prisma.empleado.create({
      data: {
        dni,
        nombre,
        apellido,
        departamento,
        puesto,
        tipoHorario,
        fechaIngreso: new Date(fechaIngreso)
      }
    })

    res.status(201).json(nuevoEmpleado)
  } catch (error) {
    console.error('Error registrando empleado:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Actualizar empleado
router.put('/empleados/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params
    const { nombre, apellido, departamento, puesto, tipoHorario, fechaIngreso } = req.body

    // Verificar que el empleado exista
    const empleadoExistente = await prisma.empleado.findUnique({
      where: { id }
    })

    if (!empleadoExistente) {
      return res.status(404).json({ message: 'Empleado no encontrado' })
    }

    const empleadoActualizado = await prisma.empleado.update({
      where: { id },
      data: {
        nombre,
        apellido,
        departamento,
        puesto,
        tipoHorario,
        fechaIngreso: fechaIngreso ? new Date(fechaIngreso) : undefined
      }
    })

    res.json(empleadoActualizado)
  } catch (error) {
    console.error('Error actualizando empleado:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Eliminar empleado
router.delete('/empleados/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params

    // Verificar que el empleado exista
    const empleadoExistente = await prisma.empleado.findUnique({
      where: { id }
    })

    if (!empleadoExistente) {
      return res.status(404).json({ message: 'Empleado no encontrado' })
    }

    // Eliminar empleado
    await prisma.empleado.delete({
      where: { id }
    })

    res.json({ message: 'Empleado eliminado correctamente' })
  } catch (error) {
    console.error('Error eliminando empleado:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Obtener horarios
router.get('/horarios', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const horarios = await prisma.configHorario.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    })
    res.json(horarios)
  } catch (error) {
    console.error('Error obteniendo horarios:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Crear horario
router.post('/horarios', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { nombre, descripcion, entradaManana, salidaManana, entradaTarde, salidaTarde, tolerancia } = req.body

    if (!nombre || !entradaManana || !salidaManana) {
      return res.status(400).json({ message: 'Nombre, entrada mañana y salida mañana son obligatorios' })
    }

    const horarioExistente = await prisma.configHorario.findFirst({
      where: { nombre }
    })

    if (horarioExistente) {
      return res.status(400).json({ message: 'Ya existe un horario con este nombre' })
    }

    const nuevoHorario = await prisma.configHorario.create({
      data: {
        nombre,
        descripcion,
        entradaManana,
        salidaManana,
        entradaTarde: entradaTarde || null,
        salidaTarde: salidaTarde || null,
        tolerancia: tolerancia || 15,
        activo: true
      }
    })

    res.status(201).json(nuevoHorario)
  } catch (error) {
    console.error('Error creando horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Actualizar horario
router.put('/horarios/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params
    const { nombre, descripcion, entradaManana, salidaManana, entradaTarde, salidaTarde, tolerancia, activo } = req.body

    const horarioExistente = await prisma.configHorario.findUnique({
      where: { id }
    })

    if (!horarioExistente) {
      return res.status(404).json({ message: 'Horario no encontrado' })
    }

    const horarioActualizado = await prisma.configHorario.update({
      where: { id },
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

    res.json(horarioActualizado)
  } catch (error) {
    console.error('Error actualizando horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Eliminar horario (marcar como inactivo)
router.delete('/horarios/:id', authenticate, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params

    const horarioExistente = await prisma.configHorario.findUnique({
      where: { id }
    })

    if (!horarioExistente) {
      return res.status(404).json({ message: 'Horario no encontrado' })
    }

    // Verificar si hay empleados usando este horario
    const empleadosConHorario = await prisma.empleado.count({
      where: { tipoHorario: horarioExistente.nombre }
    })

    if (empleadosConHorario > 0) {
      return res.status(400).json({ 
        message: 'No se puede eliminar el horario porque hay empleados asignados a él' 
      })
    }

    // Marcar como inactivo en lugar de eliminar
    await prisma.configHorario.update({
      where: { id },
      data: { activo: false }
    })

    res.json({ message: 'Horario eliminado correctamente' })
  } catch (error) {
    console.error('Error eliminando horario:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router