import re

with open('prototype/workflows/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove '+' in button labels
text = text.replace('<span>+ Thêm lĩnh vực / Mẫu mới</span>', '<span>Thêm lĩnh vực / Mẫu mới</span>')
text = text.replace('<span>+ Thêm giai đoạn</span>', '<span>Thêm giai đoạn</span>')
text = text.replace('<span>+ Thêm trường</span>', '<span>Thêm trường</span>')
text = text.replace('<span>+ Thêm trường này</span>', '<span>Thêm trường này</span>')
text = text.replace('<span>+ Thêm task con</span>', '<span>Thêm task con</span>')
text = text.replace('<span>✓ Lưu cấu hình</span>', '<span>Lưu cấu hình</span>')

# 2. Lucide git-branch icon for branches
old_branch_pill = '''                  <div class="p-2.5 rounded-xl border ${bgClass} flex items-center gap-2 shadow-2xs">
                    <span class="text-sm">🔀</span>
                    <span class="leading-tight">${b.text}</span>
                  </div>'''

new_branch_pill = '''                  <div class="p-2.5 rounded-xl border ${bgClass} flex items-center gap-2 shadow-2xs">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="6" y1="3" x2="6" y2="15"></line>
                      <circle cx="18" cy="6" r="3"></circle>
                      <circle cx="6" cy="18" r="3"></circle>
                      <path d="M18 9a9 9 0 0 1-9 9"></path>
                    </svg>
                    <span class="leading-tight">${b.text}</span>
                  </div>'''

text = text.replace(old_branch_pill, new_branch_pill)

# 3. Replace 🛡️ in approval gate with SVG shield-check
old_gate_badge = '''            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FBF3DC] text-[#976D00] border border-[#ECD9A2] inline-flex items-center gap-1">
              <span>🛡️</span>
              <span>${stage.approvalGate}</span>
            </span>'''

new_gate_badge = '''            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FBF3DC] text-[#976D00] border border-[#ECD9A2] inline-flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-[#976D00] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              <span>${stage.approvalGate}</span>
            </span>'''

text = text.replace(old_gate_badge, new_gate_badge)

# In modal select options:
text = text.replace('<option value="partner">🛡️ Cổng phê duyệt Giám đốc / Partner</option>', '<option value="partner">Cổng phê duyệt Giám đốc / Partner</option>')
text = text.replace('<option value="accountant">💼 Kế toán đối soát & xác nhận thu phí</option>', '<option value="accountant">Kế toán đối soát & xác nhận thu phí</option>')

# 4. Replace 🔒 in condition with SVG lock
old_condition = '''            <div class="pl-8 pt-1 text-xs">
              <span class="text-[#B45309] font-semibold flex items-center gap-1.5">
                <span>${stage.condition}</span>
              </span>
            </div>'''

new_condition = '''            <div class="pl-8 pt-1 text-xs">
              <span class="text-[#B45309] font-semibold flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-[#B45309] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span>${stage.condition.replace(/🔒\s*/g, '')}</span>
              </span>
            </div>'''

text = text.replace(old_condition, new_condition)

# 5. Replace ⚙️ in sidebar summary box with SVG settings
text = text.replace(
    '<span class="text-[#C59B27]">⚙️</span>',
    '<svg class="w-4 h-4 text-[#C59B27] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
)

# 6. Replace ✕ delete task button with SVG x
text = text.replace(
    '''<button onclick="removeTaskFromStage('${stage.id}', ${tIdx})" class="opacity-0 group-hover/task:opacity-100 text-slate-400 hover:text-red-500 text-[10px] p-0.5 transition-opacity" title="Xóa task này">✕</button>''',
    '''<button onclick="removeTaskFromStage('${stage.id}', ${tIdx})" class="opacity-0 group-hover/task:opacity-100 text-slate-400 hover:text-red-500 p-0.5 transition-opacity" title="Xóa task này"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>'''
)

text = text.replace(
    '''<button onclick="removeDynamicField(${fIdx})" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-[10px] p-0.5 transition-opacity" title="Xóa trường này">✕</button>''',
    '''<button onclick="removeDynamicField(${fIdx})" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-0.5 transition-opacity" title="Xóa trường này"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>'''
)

# Replace ➔ with → (standard clean arrow)
text = text.replace('➔', '→')

# Clean condition strings in templates: remove 🔒
text = re.sub(r"condition:\s*'🔒\s*", "condition: '", text)
text = text.replace("condList.push('🔒 Kế toán xác nhận thu đợt 1');", "condList.push('Kế toán xác nhận thu đợt 1');")

# Clean alerts
text = text.replace('🎉 ĐÃ LƯU MẪU QUY TRÌNH THÀNH CÔNG!', 'ĐÃ LƯU MẪU QUY TRÌNH THÀNH CÔNG!')

with open('prototype/workflows/index.html', 'w', encoding='utf-8') as f:
    f.write(text)

print("prototype/workflows/index.html fixed successfully!")
