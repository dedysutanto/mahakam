import fs from 'fs'
import { glob } from 'glob'

const files = await glob('src/modules/**/*.ts')
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  
  // Fix import path
  content = content.replace(
    /import \{ authHook \} from '..\/\.\.\/middleware\/auth'/,
    "import { authHook, validateTenantHook } from '../../middleware/auth'"
  )
  
  // Fix preValidation arrays
  content = content.replace(
    /preValidation: \[authHook\(app\), app\.validateTenant\]/g,
    'preValidation: [authHook(app), validateTenantHook(app)]'
  )
  content = content.replace(
    /preValidation: \[app\.jwtVerify\]/g,
    'preValidation: [authHook(app)]'
  )
  
  fs.writeFileSync(file, content)
  console.log('Updated:', file)
}
