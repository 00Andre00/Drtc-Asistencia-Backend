import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'

const router = express.Router()

// Crear usuarios del sistema por defecto
const createDefaultSystemUsers = async () => {
  try {
    // Operador de sistema (para activar estación)
    const existingOperador = await prisma.sistemaUser.findFirst({ 
      where: { username: 'operador' } 
    })
    if (!existingOperador) {
      const hashedPassword = await bcrypt.hash('operador123', 10)
      await prisma.sistemaUser.create({
        data: {
          username: 'operador',
          password: hashedPassword,
          nombre: 'Operador del Sistema',
          role: 'operador'
        }
      })
      console.log('✅ Usuario operador creado: operador/operador123')
    }

    // Admin RRHH
    const existingAdmin = await prisma.sistemaUser.findFirst({ 
      where: { username: 'admin' } 
    })
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10)
      await prisma.sistemaUser.create({
        data: {
          username: 'admin',
          password: hashedPassword,
          nombre: 'Administrador RRHH',
          role: 'admin'
        }
      })
      console.log('✅ Usuario admin creado: admin/admin123')
    }

    // Empleado de ejemplo - CORREGIDO con tipoHorario
    const existingEmpleado = await prisma.empleado.findFirst({ 
      where: { dni: '12345678' } 
    })
    if (!existingEmpleado) {
      await prisma.empleado.create({
        data: {
          dni: '12345678',
          nombre: 'Carlos',
          apellido: 'Rodríguez',
          departamento: 'TI',
          puesto: 'Desarrollador',
          tipoHorario: 'CAS', // ← AGREGAR ESTE CAMPO
          fechaIngreso: new Date('2023-01-15')
        }
      })
      console.log('✅ Empleado ejemplo creado: 12345678')
    }

    // Crear configuraciones de horario por defecto si no existen
    const existingHorarios = await prisma.configHorario.findMany()
    if (existingHorarios.length === 0) {
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
      console.log('✅ Configuraciones de horario por defecto creadas')
    }

  } catch (error) {
    console.error('Error creando usuarios por defecto:', error)
  }
}

createDefaultSystemUsers()

// Login del sistema
router.post('/login', async (req: express.Request, res: express.Response) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Usuario y contraseña son requeridos' })
    }

    const user = await prisma.sistemaUser.findUnique({
      where: { username: username }
    })

    if (!user || !user.activo) {
      return res.status(401).json({ message: 'Credenciales inválidas' })
    }

    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciales inválidas' })
    }

    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        role: user.role
      },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    )

    res.json({
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        role: user.role
      },
      token
    })
  } catch (error) {
    console.error('Error en login:', error)
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Verificar token
router.post('/verify', async (req: express.Request, res: express.Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    res.json({ valid: true, user: decoded })
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Token inválido' })
  }
})

export default router