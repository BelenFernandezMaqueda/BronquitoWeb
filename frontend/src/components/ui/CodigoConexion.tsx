import type { ConexionDispositivo } from '../../api/dispositivo'

/**
 * Recuadro con el código (último número de la IP de la compu) que se tipea
 * en la ESP para que encuentre al servidor. Lo usan la vista del médico y la
 * del paciente.
 */
export function CodigoConexion({ conexion }: { conexion: ConexionDispositivo }) {
  return (
    <section className="dispositivo-codigo">
      {conexion.codigo ? (
        <>
          <span className="dispositivo-codigo-label">Código para conectar el dispositivo</span>
          <span className="dispositivo-codigo-numero">{conexion.codigo}</span>
          <span className="dispositivo-codigo-ayuda">
            Ingresalo en la ESP. Es el final de la IP de esta compu ({conexion.ip}:{conexion.puerto}); la ESP tiene
            que estar en la misma red WiFi.
          </span>
        </>
      ) : (
        <span className="dispositivo-codigo-ayuda">
          No pudimos averiguar la IP de esta compu, así que no hay código para la ESP. Levantá Bronquito con{' '}
          <code>./levantar.sh</code>.
        </span>
      )}
    </section>
  )
}
