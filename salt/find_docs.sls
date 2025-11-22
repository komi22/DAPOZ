
# 이 파일을 Docker Salt Master 컨테이너의 /srv/salt/ 디렉토리로 복사해야 합니다
# 명령어: docker cp salt/find_docs.sls salt_master:/srv/salt/find_docs.sls

find_documents:
  cmd.run:
    - name: 'powershell.exe -Command "Get-ChildItem -Recurse C:\Users -Include *.txt,*.pdf,*.doc,*.docx,*.ppt,*.pptx,*.xls,*.xlsx,*.csv,*.hwp,*.rtf -File | Select-Object -ExpandProperty FullName"'
    - shell: cmd
    - timeout: 300
    - unless: 'powershell.exe -Command "Test-Path C:\Users"'
