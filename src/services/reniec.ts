import axios from 'axios'

const RENIEC_API_URL = process.env.RENIEC_API_URL || 'https://apiperu.dev/api/dni'
const RENIEC_API_TOKEN = process.env.RENIEC_API_TOKEN || 'bajedepepita'

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
    return response.data
  } catch (error: any) {
    console.error('Error consultando RENIEC:', error.response?.data || error.message)
    throw new Error('Error al consultar RENIEC: ' + (error.response?.data?.message || error.message))
  }
}