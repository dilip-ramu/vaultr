import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildContractData, type ContractCompany } from '@/lib/contracts/variables'
import { renderContractDocx } from '@/lib/contracts/render'
import type { Employee } from '@/lib/payroll/types'

export const runtime = 'nodejs'

const BUCKET = 'vaultr-attachments'

function slug(s: string) {
  return (s || 'employee').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ── POST /api/contracts/generate ── render an employee's contract, archive it
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { employeeId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const employeeId = body.employeeId
  if (!employeeId) return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })

  const { data: employee } = await supabase
    .from('employees').select('*').eq('id', employeeId).eq('user_id', user.id).maybeSingle()
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const emp = employee as Employee
  const designation = (emp.designation ?? '').trim()
  if (!designation) {
    return NextResponse.json({ error: 'This employee has no designation set — add one first.' }, { status: 400 })
  }

  // Resolve the template for this employee's company + designation.
  let q = supabase.from('contract_templates').select('*')
    .eq('user_id', user.id).ilike('designation', designation)
  q = emp.company_id ? q.eq('company_id', emp.company_id) : q.is('company_id', null)
  const { data: template } = await q.maybeSingle()

  if (!template || Number(template.current_version ?? 0) < 1) {
    const where = emp.company_id ? 'this company' : 'Personal'
    return NextResponse.json({
      error: `No contract template for "${designation}" at ${where}. Upload one on the Contracts page.`,
    }, { status: 404 })
  }

  const { data: version } = await supabase
    .from('contract_template_versions').select('file_path, version')
    .eq('template_id', template.id).eq('version', template.current_version).maybeSingle()
  if (!version) return NextResponse.json({ error: 'Template file missing' }, { status: 500 })

  // Download the template .docx.
  const { data: fileBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(version.file_path as string)
  if (dlErr || !fileBlob) return NextResponse.json({ error: 'Could not read template file' }, { status: 500 })
  const templateBuffer = Buffer.from(await fileBlob.arrayBuffer())

  // Company vars.
  let company: ContractCompany | null = null
  if (emp.company_id) {
    const { data: co } = await supabase.from('companies')
      .select('name, address, gstin, email, phone').eq('id', emp.company_id).eq('user_id', user.id).maybeSingle()
    company = (co as ContractCompany | null) ?? null
  }

  const data = buildContractData(emp, company)

  let output: Buffer
  try {
    output = renderContractDocx(templateBuffer, data as unknown as Record<string, unknown>)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Template render failed'
    return NextResponse.json({ error: `Couldn't fill the template: ${msg}` }, { status: 400 })
  }

  // Archive the generated contract.
  const genPath = `${user.id}/contracts/generated/${employeeId}/${Date.now()}.docx`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(genPath, output, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const fileName = `${slug(emp.name)}-${slug(designation)}-contract.docx`
  await supabase.from('generated_contracts').insert({
    user_id: user.id, employee_id: employeeId,
    template_id: template.id, template_version: version.version,
    file_path: genPath, file_name: fileName,
    employee_name: emp.name, designation,
    data_snapshot: data,
  })

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(genPath, 600)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Could not create download link' }, { status: 500 })

  return NextResponse.json({ url: signed.signedUrl, fileName })
}
