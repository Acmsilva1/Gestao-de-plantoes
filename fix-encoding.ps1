$files = Get-ChildItem -Recurse -File |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\|\\.codex-logs\\' } |
  Where-Object { $_.Extension -in '.js','.jsx','.ts','.tsx','.md','.sql','.html','.css','.json' }

$map = [ordered]@{
  'Ã¡'='á'; 'Ã¢'='â'; 'Ã£'='ã'; 'Ã¤'='ä'; 'Ã§'='ç'; 'Ã©'='é'; 'Ãª'='ê'; 'Ã­'='í'; 'Ã³'='ó'; 'Ã´'='ô'; 'Ãµ'='õ'; 'Ãº'='ú'; 'Ã '='à';
  'Ã�'='Á'; 'Ã‚'='Â'; 'Ãƒ'='Ã'; 'Ã‡'='Ç'; 'Ã‰'='É'; 'ÃŠ'='Ê'; 'Ã�'='Í'; 'Ã“'='Ó'; 'Ã”'='Ô'; 'Ã•'='Õ'; 'Ãš'='Ú';
  'â€¢'='•'; 'â€”'='—'; 'â€“'='–'; 'â€˜'='‘'; 'â€™'='’'; 'â€œ'='“'; 'â€'='”'; 'â€¦'='…';
  'atÃ©'='até'; 'NÃ£o'='Não'; 'MÃªs'='Mês'; 'CalendÃ¡rio'='Calendário'; 'plantÃµes'='plantões'; 'mÃ©dico'='médico'; 'ConfiguraÃ§Ã£o'='Configuração'; 'DisponÃ­veis'='Disponíveis';
  'PrÃ³ximo'='Próximo'; 'VisualizaÃ§Ã£o'='Visualização'; 'AnalÃ­tica'='Analítica'; 'previsÃ£o'='previsão'; 'OcupaÃ§Ã£o'='Ocupação'; 'Nacional'='Nacional';
  'MÃ©dico'='Médico'; 'mÃ©dicos'='médicos'; 'MÃªs anterior'='Mês anterior'; 'plantÃ£o'='plantão'; 'vÃ­nculo'='vínculo'; 'vÃ­nculos'='vínculos';
  'Ã s'='às'; 'nÃ£o'='não'; 'sessÃ£o'='sessão'; 'seguranÃ§a'='segurança'; 'padrÃ£o'='padrão'; 'trocÃ¡-la'='trocá-la'; 'estÃ£o'='estão';
  'âš ï¸'='⚠️'; 'â•'='═'; 'â€”â€”â€”'='———'
}

$changed = 0
foreach ($f in $files) {
  $text = Get-Content -Path $f.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -eq $text) { continue }
  $orig = $text
  foreach ($k in $map.Keys) { $text = $text.Replace($k, $map[$k]) }
  if ($text -ne $orig) {
    Set-Content -Path $f.FullName -Value $text -Encoding utf8
    $changed++
    Write-Output "CHANGED: $($f.FullName)"
  }
}
Write-Output "TOTAL_CHANGED=$changed"
