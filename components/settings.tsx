"use client";

import { useId, useState } from "react";
import { priorities, priorityStars } from "@/data/priorities";
import { regionsForSubject } from "@/data/regions";
import { unitById, unitGroups } from "@/data/units";
import { useEventCatalog } from "./community-provider";
import { answerParts, DEFAULT_SETTINGS, filterEvents, formatSignedYear, MODES, ORDERS, rangeError, regionRange, SCOPE_METHODS, selectRegion, selectSubject, SUBJECTS } from "@/lib/study";
import { updateStore, useStudyStore } from "@/lib/storage";
import type { Mode, Priority, Settings } from "@/lib/types";
import { Icon, Modal } from "./ui";

export function SubjectControl({ settings, onChange }: { settings: Settings; onChange: (value: Settings) => void }) {
  const group = useId();
  return <fieldset className="field"><legend>科目</legend><div className="segments">{(["japan", "world", "both"] as const).map((value) => <label key={value} className={settings.subject === value ? "selected" : ""}><input type="radio" name={group} checked={settings.subject === value} onChange={() => onChange(selectSubject(settings, value))}/>{value === "both" ? "両方" : SUBJECTS[value]}</label>)}</div></fieldset>;
}
const modeLabels: Record<Mode, string> = { exact: "年号すべて", decade: "下一桁ヒント", hundred: "下二桁ヒント", century: "世紀" };

export function ModeControl({ settings, onChange }: { settings: Settings; onChange: (value: Settings) => void }) {
  const group = useId();
  return <fieldset className="field mode-field"><legend>解答方式</legend><div className="mode-grid">{(Object.keys(MODES) as Mode[]).map((value) => {
    const parts = answerParts({ year: 1648 }, value);
    const unit = value === "century" ? "世紀" : "年";
    return <label key={value} className={`mode-option ${settings.mode === value ? "selected" : ""}`}>
      <input type="radio" name={group} aria-label={`${modeLabels[value]}。1648年なら${parts.prefix}を入力`} checked={settings.mode === value} onChange={() => onChange({ ...settings, mode: value })}/>
      <span className="mode-copy"><strong>{modeLabels[value]}</strong><span className="mode-example" aria-hidden="true"><span className="mode-example-input">{"□".repeat(parts.inputDigits)}</span>{parts.suffix}<span className="mode-example-unit">{unit}</span></span><small><b>{parts.prefix}</b> を入力</small></span><span className="radio-mark" aria-hidden="true"/>
    </label>;
  })}</div></fieldset>;
}
export function CountControl({ settings, onChange }: { settings: Settings; onChange: (value: Settings) => void }) {
  return <label className="field count-field"><span>出題数</span><select value={settings.count} onChange={(e) => onChange({ ...settings, count: e.target.value === "all" ? "all" : Number(e.target.value) as Settings["count"] })}>{[10, 20, 50, "all"].map((value) => <option key={value} value={value}>{value === "all" ? "全問" : `${value}問`}</option>)}</select></label>;
}
export function OrderCount({ settings, onChange }: { settings: Settings; onChange: (value: Settings) => void }) {
  return <div className="two-fields">{settings.scopeMethod !== "random" && <label className="field"><span>出題順</span><select value={settings.order} onChange={(e) => onChange({ ...settings, order: e.target.value as Settings["order"] })}>{Object.entries(ORDERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<CountControl settings={settings} onChange={onChange}/></div>;
}
export function StudyPreferences({ settings, onChange }: { settings: Settings; onChange: (value: Settings) => void }) {
  return <div className="study-preferences">
    <label className="check-field unseen-control"><input type="checkbox" checked={settings.prioritizeUnseen} onChange={(e) => onChange({ ...settings, prioritizeUnseen: e.target.checked })}/>未出題を優先</label>
    <label className="check-field weak-control"><input type="checkbox" checked={settings.prioritizeWeak} onChange={(e) => onChange({ ...settings, prioritizeWeak: e.target.checked })}/>苦手を優先</label>
  </div>;
}
export function scopeSummary(settings: Settings) {
  if (settings.scopeMethod === "units") return `単元から選択 · ${settings.unitIds.filter((id) => settings.subject === "both" || unitById.get(id)?.subject === settings.subject).length}単元`;
  if (settings.scopeMethod === "region") {
    const range = regionRange(settings);
    return range ? `${range.region.name} · ${range.start.name}〜${range.end.name}` : "地域×時代から選択";
  }
  return SCOPE_METHODS.random;
}
function UnitTree({ settings, change }: { settings: Settings; change: (s: Settings) => void }) {
  const { events } = useEventCatalog();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase("ja-JP");
  const groups = unitGroups.filter((g) => settings.subject === "both" || g.subject === settings.subject).filter((g) => !q || `${g.id} ${g.name} ${g.units.map((u) => u.name).join(" ")}`.toLocaleLowerCase("ja-JP").includes(q));
  const toggle = (ids: string[], checked: boolean) => change({ ...settings, unitIds: checked ? [...new Set([...settings.unitIds, ...ids])] : settings.unitIds.filter((id) => !ids.includes(id)) });
  return <div className="unit-selector"><label className="search-field"><Icon name="search" size={17}/><input aria-label="単元名で検索" placeholder="単元名で検索" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
    <div className="unit-tools"><span>{settings.unitIds.filter((id) => unitGroups.some((g) => (settings.subject === "both" || g.subject === settings.subject) && g.units.some((u) => u.id === id))).length}単元を選択</span><button type="button" className="text-button" onClick={() => toggle(unitGroups.filter((g) => settings.subject === "both" || g.subject === settings.subject).flatMap((g) => g.units.map((u) => u.id)), false)}>選択を解除</button></div>
    {groups.map((g) => {
      const ids = g.units.map((u) => u.id), selected = ids.filter((id) => settings.unitIds.includes(id)).length;
      const visible = q && !`${g.id} ${g.name}`.toLocaleLowerCase("ja-JP").includes(q) ? g.units.filter((u) => u.name.toLocaleLowerCase("ja-JP").includes(q)) : g.units;
      return <details className="unit-group" key={g.id} open={q ? true : undefined} data-group-id={g.id}><summary><label className="group-checkbox" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`${g.name}を一括選択`} checked={selected === ids.length} ref={(el) => { if (el) el.indeterminate = selected > 0 && selected < ids.length; }} onChange={(e) => toggle(ids, e.target.checked)}/></label><span>{g.name}</span><small>{selected}/{ids.length}</small></summary><div className="unit-children">{visible.map((u) => {
        const count = events.filter((e) => (e.reviewStatus !== "unverified" || settings.includeUnverified) && (e.unitId === u.id || e.relatedUnitIds?.includes(u.id))).length;
        return <label key={u.id}><input type="checkbox" checked={settings.unitIds.includes(u.id)} onChange={(e) => toggle([u.id], e.target.checked)}/><span>{u.name}</span><small>{count}問</small></label>;
      })}</div></details>;
    })}{!groups.length && <p className="empty-state">一致する単元がありません。</p>}
  </div>;
}
function RegionRange({ settings, change }: { settings: Settings; change: (s: Settings) => void }) {
  const options = regionsForSubject(settings.subject);
  const region = options.find((r) => r.id === settings.regionId) ?? options[0];
  const start = region.periods.find((p) => p.id === settings.startPeriodId) ?? region.periods[0];
  const end = region.periods.find((p) => p.id === settings.endPeriodId) ?? region.periods.at(-1)!;
  const range = regionRange(settings);
  return <div className="region-selector"><label className="field"><span>地域</span><select value={region.id} onChange={(e) => change(selectRegion(settings, e.target.value))}>{options.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><div className="two-fields"><label className="field"><span>開始時代</span><select value={start.id} onChange={(e) => { const next = region.periods.find((p) => p.id === e.target.value)!; change({ ...settings, startPeriodId: next.id, endPeriodId: next.order > end.order ? next.id : end.id }); }}>{region.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field"><span>終了時代</span><select value={end.id} onChange={(e) => change({ ...settings, endPeriodId: e.target.value })}>{region.periods.filter((p) => p.order >= start.order).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>{range && <p className="range-caption">{formatSignedYear(range.from)}〜{formatSignedYear(range.to)}</p>}</div>;
}
export function PriorityFilter({ settings, change }: { settings: Settings; change: (s: Settings) => void }) {
  const equal = (values: number[]) => settings.priorities.length === values.length && values.every((p) => settings.priorities.includes(p as Priority));
  const allButton = <button type="button" aria-pressed={equal([])} className={equal([]) ? "selected" : ""} onClick={() => change({ ...settings, priorities: [] })}>すべて</button>;
  return <fieldset className="field priority-field">
    <legend>優先度</legend>
    <div className="chips priority-shortcuts">{allButton}{[{label:"★★★★★のみ",values:[5]},{label:"★★★★以上",values:[4,5]},{label:"★★★以上",values:[3,4,5]}].map(({label,values}) => <button type="button" key={label} aria-pressed={equal(values)} className={equal(values)?"selected":""} onClick={() => change({ ...settings, priorities: values as Priority[] })}>{label}</button>)}</div>
    <div className="priority-options" aria-label="任意の星を複数選択">{priorities.map((p) => <label key={p.value} title={p.label}>
      <input type="checkbox" aria-label={`星${p.value}（${p.label}）`} checked={settings.priorities.includes(p.value)} onChange={(e) => change({ ...settings, priorities: e.target.checked ? [...settings.priorities,p.value] : settings.priorities.filter((v) => v !== p.value) })}/><span className="priority-stars" aria-hidden="true">{priorityStars(p.value)}</span><small>{p.label}</small>
    </label>)}</div>
  </fieldset>;
}
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { events } = useEventCatalog();
  const { store, ready } = useStudyStore(); const settings = store.settings;
  const methodGroup = useId();
  const [presetName, setPresetName] = useState(""); const [presetError, setPresetError] = useState("");
  const change = (s: Settings) => updateStore((previous) => ({ ...previous, settings: s }));
  const count = filterEvents(events, { ...settings, priorities: [], statuses: [] }, store.history).length;
  const error = rangeError(settings);
  const resetScope = () => {
    const defaults = selectSubject(DEFAULT_SETTINGS, settings.subject);
    change({ ...settings, scopeMethod: defaults.scopeMethod, unitIds: [], regionId: defaults.regionId, startPeriodId: defaults.startPeriodId, endPeriodId: defaults.endPeriodId });
  };
  return <Modal title="出題範囲" className="settings-modal" onClose={onClose} footer={<><div className="target-count scope-target-count" aria-live="polite">範囲内 <strong>{ready ? count : "—"}</strong> 問</div><button className="primary" disabled={!ready || !!error} onClick={onClose}>この範囲を使う<Icon name="check" size={18}/></button></>}><div className="settings-fields">
    <fieldset className="field"><legend>範囲の選び方</legend><div className="scope-methods">{Object.entries(SCOPE_METHODS).map(([value,label]) => <label key={value} className={settings.scopeMethod===value?"selected":""}><input type="radio" name={methodGroup} checked={settings.scopeMethod===value} onChange={() => change({ ...settings, scopeMethod: value as Settings["scopeMethod"] })}/><span>{label}</span></label>)}</div></fieldset>
    {settings.scopeMethod === "units" && <UnitTree settings={settings} change={change}/>}
    {settings.scopeMethod === "region" && <RegionRange settings={settings} change={change}/>}
    <p className="scope-modal-summary" aria-live="polite">{scopeSummary(settings)}</p>
    <details className="filter-details" hidden><summary>保存したプリセット<span>{store.presets.length}件</span></summary><div className="detail-content">{store.presets.map((p) => <div className="preset-row" key={p.id}><button className="text-button" onClick={() => change(structuredClone(p.settings))}>{p.name}</button><button className="icon-button" aria-label={`${p.name}を削除`} onClick={() => updateStore((s) => ({ ...s, presets: s.presets.filter((v) => v.id!==p.id) }))}><Icon name="close" size={16}/></button></div>)}<form className="preset-form" onSubmit={(e) => { e.preventDefault(); if(!presetName.trim()){setPresetError("プリセット名を入力してください。");return;} updateStore((s) => ({ ...s, presets: [...s.presets,{id:crypto.randomUUID(),name:presetName.trim(),settings:structuredClone(settings)}] }));setPresetName("");setPresetError(""); }}><input aria-label="プリセット名" placeholder="プリセット名" value={presetName} maxLength={40} onChange={(e) => setPresetName(e.target.value)}/><button className="secondary" type="submit">現在の条件を保存</button></form>{presetError && <p role="alert" className="error-text">{presetError}</p>}</div></details>
    <button className="text-button muted reset-settings" onClick={resetScope}>範囲をリセット</button>
    {ready && (error || !count) && <p className="inline-error" role="status">{error || "この範囲には問題が登録されていません。"}</p>}
  </div></Modal>;
}
