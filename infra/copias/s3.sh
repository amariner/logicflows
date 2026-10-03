# Configuración del bucket de las copias para rclone (ADR-0017), a partir de
# las variables COPIAS_S3_*. Se incluye con `source` desde los otros scripts.
: "${COPIAS_S3_ENDPOINT:?Falta COPIAS_S3_ENDPOINT}"
: "${COPIAS_S3_BUCKET:?Falta COPIAS_S3_BUCKET}"
: "${COPIAS_S3_ACCESS_KEY_ID:?Falta COPIAS_S3_ACCESS_KEY_ID}"
: "${COPIAS_S3_SECRET_ACCESS_KEY:?Falta COPIAS_S3_SECRET_ACCESS_KEY}"

# Sin fichero de configuración: todo llega por variables de entorno.
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_COPIAS_TYPE=s3
export RCLONE_CONFIG_COPIAS_PROVIDER=Other
export RCLONE_CONFIG_COPIAS_ENDPOINT="$COPIAS_S3_ENDPOINT"
export RCLONE_CONFIG_COPIAS_REGION="${COPIAS_S3_REGION:-auto}"
export RCLONE_CONFIG_COPIAS_ACCESS_KEY_ID="$COPIAS_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_COPIAS_SECRET_ACCESS_KEY="$COPIAS_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_COPIAS_FORCE_PATH_STYLE=true
# El bucket ya existe: comprobarlo pediría permisos que no hacen falta.
export RCLONE_CONFIG_COPIAS_NO_CHECK_BUCKET=true

BUCKET="copias:$COPIAS_S3_BUCKET"
BASES="${COPIAS_BASES:-logicflows keycloak}"
