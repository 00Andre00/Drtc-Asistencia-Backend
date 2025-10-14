import axios from 'axios'

const RENIEC_API_URL = process.env.RENIEC_API_URL || 'https://apiperu.dev/api/dni'
const RENIEC_API_TOKEN = process.env.RENIEC_API_TOKEN

if (!RENIEC_API_TOKEN) {
  console.error('ERROR: RENIEC_API_TOKEN no está configurado en las variables de entorno')
}

export interface ReniecResponse {
  success: boolean
  data: {
    numero: string
    nombre_completo: string
    nombres: string
    apellido_paterno: string
    apellido_materno: string
    codigo_verificacion: string
  }
}

export const consultarReniec = async (dni: string): Promise<ReniecResponse> => {
  try {
    if (!RENIEC_API_TOKEN) {
      throw new Error('Token de API RENIEC no configurado')
    }

    const response = await axios.post<ReniecResponse>(
      RENIEC_API_URL,
      { dni },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RENIEC_API_TOKEN}`
        },
        timeout: 10000
      }
    )

    if (!response.data.success) {
      throw new Error('DNI no encontrado en RENIEC')
    }

    return response.data
  } catch (error: any) {
    console.error('Error consultando RENIEC:', error.response?.data || error.message)
    
    if (error.response?.status === 404) {
      throw new Error('DNI no encontrado en RENIEC')
    }
    
    if (error.response?.status === 401) {
      throw new Error('Token de API RENIEC inválido')
    }
    
    throw new Error(error.response?.data?.message || error.message || 'Error al consultar RENIEC')
  }
}