/*
component-meta:
  name: MapaAproveitamentoPreview
  description: Preview and PDF generation for the Mapa de Aproveitamento escolar (Angola MED format)
  responsive: true
*/

import React from 'react'

export interface MapaAproveitamentoTurmaData {
    turma_id: string
    turma_nome: string
    turma_codigo: string
    classe: string
    nivel_ensino: string
    disciplinas: Array<{
        id: string
        nome: string
        inscritos_m: number
        inscritos_f: number
        frequentaram_m: number
        frequentaram_f: number
        aprovados_m: number
        aprovados_f: number
        reprovados_m: number
        reprovados_f: number
        desistentes_m: number
        desistentes_f: number
        transferidos_m: number
        transferidos_f: number
        media_turma: number | null
    }>
}

export interface MapaAproveitamentoData {
    escola: {
        nome: string
        provincia: string
        municipio: string
        codigo_escola?: string
    }
    ano_lectivo: number
    trimestre: number | 'anual'
    turmas: MapaAproveitamentoTurmaData[]
}

interface Props {
    data: MapaAproveitamentoData
    headerConfig?: {
        logo_url?: string | null
        nome_escola: string
        provincia?: string
        municipio?: string
        nivel_ensino?: string
        mostrar_republica?: boolean
        texto_republica?: string
        mostrar_governo_provincial?: boolean
        mostrar_orgao_educacao?: boolean
    } | null
}

function getTrimLabel(trimestre: number | 'anual'): string {
    if (trimestre === 'anual') return 'Anual'
    return `${trimestre}º Trimestre`
}

function sumRow(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0)
}

export const MapaAproveitamentoPreview: React.FC<Props> = ({ data, headerConfig }) => {
    const escola = headerConfig?.nome_escola || data.escola.nome
    const provincia = headerConfig?.provincia || data.escola.provincia
    const municipio = headerConfig?.municipio || data.escola.municipio
    const trimLabel = getTrimLabel(data.trimestre)

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 text-center space-y-0.5">
                {headerConfig?.mostrar_republica && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {headerConfig.texto_republica || 'República de Angola'}
                    </p>
                )}
                {headerConfig?.mostrar_governo_provincial && (
                    <p className="text-xs text-slate-600">Governo Provincial da {provincia}</p>
                )}
                {headerConfig?.mostrar_orgao_educacao && (
                    <p className="text-xs text-slate-600">
                        {(headerConfig.nivel_ensino || '').toLowerCase().includes('secundário') || (headerConfig.nivel_ensino || '').toLowerCase().includes('secundario')
                            ? `Direcção Provincial da Educação da ${provincia}`
                            : `Administração Municipal de ${municipio}`
                        }
                    </p>
                )}
                <p className="text-sm font-bold text-slate-800">{escola}</p>
                <p className="text-base font-extrabold text-blue-800 uppercase tracking-wider mt-1">
                    Mapa de Aproveitamento
                </p>
                <p className="text-xs text-slate-500">
                    Ano Lectivo: <strong>{data.ano_lectivo}</strong> &nbsp;|&nbsp; Período: <strong>{trimLabel}</strong>
                </p>
                {municipio && (
                    <p className="text-xs text-slate-500">Município de {municipio}</p>
                )}
            </div>

            {/* Tables per turma */}
            <div className="divide-y divide-slate-200">
                {data.turmas.map((turma) => {
                    const totInsM = sumRow(turma.disciplinas.map(d => d.inscritos_m))
                    const totInsF = sumRow(turma.disciplinas.map(d => d.inscritos_f))
                    const totFreqM = sumRow(turma.disciplinas.map(d => d.frequentaram_m))
                    const totFreqF = sumRow(turma.disciplinas.map(d => d.frequentaram_f))
                    const totAprvM = sumRow(turma.disciplinas.map(d => d.aprovados_m))
                    const totAprvF = sumRow(turma.disciplinas.map(d => d.aprovados_f))
                    const totRepM = sumRow(turma.disciplinas.map(d => d.reprovados_m))
                    const totRepF = sumRow(turma.disciplinas.map(d => d.reprovados_f))
                    const totDesM = sumRow(turma.disciplinas.map(d => d.desistentes_m))
                    const totDesF = sumRow(turma.disciplinas.map(d => d.desistentes_f))
                    const totTransM = sumRow(turma.disciplinas.map(d => d.transferidos_m))
                    const totTransF = sumRow(turma.disciplinas.map(d => d.transferidos_f))

                    const totalAprvGeral = totAprvM + totAprvF
                    const totalFreqGeral = totFreqM + totFreqF
                    const taxaAprov = totalFreqGeral > 0 ? (totalAprvGeral / totalFreqGeral * 100) : 0

                    return (
                        <div key={turma.turma_id} className="p-4">
                            {/* Turma header */}
                            <div className="flex flex-wrap gap-4 mb-3">
                                <div className="text-sm font-bold text-slate-800">
                                    Turma: <span className="text-blue-700">{turma.turma_codigo}</span>
                                </div>
                                <div className="text-sm text-slate-600">
                                    Classe: <strong>{turma.classe}</strong>
                                </div>
                                <div className="text-sm text-slate-600">
                                    Nível: <strong>{turma.nivel_ensino}</strong>
                                </div>
                                <div className="text-sm text-green-700 font-semibold">
                                    Taxa de Aprovação: {taxaAprov.toFixed(1)}%
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse border border-slate-300 min-w-[900px]">
                                    <thead>
                                        <tr className="bg-blue-900 text-white">
                                            <th rowSpan={2} className="border border-blue-700 px-2 py-1.5 text-left font-semibold text-xs w-32">
                                                Disciplinas
                                            </th>
                                            <th colSpan={3} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs">
                                                Inscritos
                                            </th>
                                            <th colSpan={3} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs">
                                                Frequentaram
                                            </th>
                                            <th colSpan={3} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs">
                                                Aprovados
                                            </th>
                                            <th colSpan={3} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs">
                                                Reprovados
                                            </th>
                                            <th colSpan={3} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs">
                                                Desistentes
                                            </th>
                                            <th colSpan={3} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs">
                                                Transferidos
                                            </th>
                                            <th rowSpan={2} className="border border-blue-700 px-1 py-1 text-center font-semibold text-xs w-14">
                                                Média
                                            </th>
                                        </tr>
                                        <tr className="bg-blue-800 text-white">
                                            {['M', 'F', 'T', 'M', 'F', 'T', 'M', 'F', 'T', 'M', 'F', 'T', 'M', 'F', 'T', 'M', 'F', 'T'].map((h, i) => (
                                                <th key={i} className="border border-blue-700 px-1 py-1 text-center font-medium text-xs w-8">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {turma.disciplinas.map((disc, idx) => {
                                            const insT = disc.inscritos_m + disc.inscritos_f
                                            const freqT = disc.frequentaram_m + disc.frequentaram_f
                                            const aprvT = disc.aprovados_m + disc.aprovados_f
                                            const repT = disc.reprovados_m + disc.reprovados_f
                                            const desT = disc.desistentes_m + disc.desistentes_f
                                            const transT = disc.transferidos_m + disc.transferidos_f
                                            return (
                                                <tr
                                                    key={disc.id}
                                                    className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}
                                                >
                                                    <td className="border border-slate-300 px-2 py-1 text-slate-800 font-medium truncate max-w-[128px]" title={disc.nome}>
                                                        {disc.nome}
                                                    </td>
                                                    {/* Inscritos */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700">{disc.inscritos_m || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700">{disc.inscritos_f || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center font-semibold text-slate-800">{insT || '-'}</td>
                                                    {/* Frequentaram */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700">{disc.frequentaram_m || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700">{disc.frequentaram_f || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center font-semibold text-slate-800">{freqT || '-'}</td>
                                                    {/* Aprovados */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-green-700">{disc.aprovados_m || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-green-700">{disc.aprovados_f || '-'}</td>
                                                    <td className={`border border-slate-300 px-1 py-1 text-center font-bold ${aprvT > 0 ? 'text-green-700' : 'text-slate-400'}`}>{aprvT || '-'}</td>
                                                    {/* Reprovados */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-red-600">{disc.reprovados_m || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-red-600">{disc.reprovados_f || '-'}</td>
                                                    <td className={`border border-slate-300 px-1 py-1 text-center font-bold ${repT > 0 ? 'text-red-600' : 'text-slate-400'}`}>{repT || '-'}</td>
                                                    {/* Desistentes */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-amber-600">{disc.desistentes_m || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-amber-600">{disc.desistentes_f || '-'}</td>
                                                    <td className={`border border-slate-300 px-1 py-1 text-center font-bold ${desT > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{desT || '-'}</td>
                                                    {/* Transferidos */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-blue-600">{disc.transferidos_m || '-'}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-blue-600">{disc.transferidos_f || '-'}</td>
                                                    <td className={`border border-slate-300 px-1 py-1 text-center font-bold ${transT > 0 ? 'text-blue-600' : 'text-slate-400'}`}>{transT || '-'}</td>
                                                    {/* Média */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center font-bold text-slate-700">
                                                        {disc.media_turma !== null && disc.media_turma !== undefined
                                                            ? disc.media_turma.toFixed(1)
                                                            : '—'
                                                        }
                                                    </td>
                                                    {/* Taxa % inline (small badge) */}
                                                </tr>
                                            )
                                        })}

                                        {/* Totals row */}
                                        <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
                                            <td className="border border-slate-300 px-2 py-1.5 text-blue-900 font-bold text-xs">TOTAL</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900">{totInsM}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900">{totInsF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900 font-extrabold">{totInsM + totInsF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900">{totFreqM}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900">{totFreqF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900 font-extrabold">{totFreqM + totFreqF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-green-700">{totAprvM}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-green-700">{totAprvF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-green-700 font-extrabold">{totAprvM + totAprvF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-red-600">{totRepM}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-red-600">{totRepF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-red-600 font-extrabold">{totRepM + totRepF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-amber-600">{totDesM}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-amber-600">{totDesF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-amber-600 font-extrabold">{totDesM + totDesF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-600">{totTransM}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-600">{totTransF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-600 font-extrabold">{totTransM + totTransF}</td>
                                            <td className="border border-slate-300 px-1 py-1 text-center text-blue-900">—</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary bar */}
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                                <span>Inscritos: <strong>{totInsM + totInsF}</strong> (M:{totInsM} / F:{totInsF})</span>
                                <span className="text-green-700">Aprovados: <strong>{totAprvM + totAprvF}</strong></span>
                                <span className="text-red-600">Reprovados: <strong>{totRepM + totRepF}</strong></span>
                                <span className="text-amber-600">Desistentes: <strong>{totDesM + totDesF}</strong></span>
                                <span className="text-blue-600">Transferidos: <strong>{totTransM + totTransF}</strong></span>
                                <span className="text-blue-900 font-bold">Taxa Aprovação: {taxaAprov.toFixed(1)}%</span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer legend */}
            <div className="px-4 pb-4 pt-2 border-t border-slate-200 mt-2">
                <p className="text-xs text-slate-400 italic">
                    M = Masculino &nbsp;|&nbsp; F = Feminino &nbsp;|&nbsp; T = Total &nbsp;|&nbsp;
                    Frequência mínima exigida: 66,67% &nbsp;|&nbsp;
                    Aprovação: {data.turmas[0]?.nivel_ensino?.toLowerCase().includes('primár') ? '≥ 5 valores' : '≥ 10 valores (7-9 condicional para 7ª/8ª/10ª/11ª)'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                    Documento gerado pelo sistema EduGest em conformidade com as normas do MED — Angola.
                </p>
            </div>
        </div>
    )
}
