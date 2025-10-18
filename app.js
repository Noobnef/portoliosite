// ===== utils =====
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const LS_KEY = 'my_portfolio_posts_v1';

const byId = id => document.getElementById(id);
const nowISO = () => new Date().toISOString();
const fmtDate = iso => {
  try { return new Date(iso).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'}); }
  catch { return iso; }
};
const slugify = s => (s || 'bai-viet').toLowerCase().trim()
  .normalize('NFD').replace(/\p{Diacritic}/gu,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2));
const getParam = name => new URL(location.href).searchParams.get(name);

// Parse Markdown đơn giản thành HTML
function parseSimpleMarkdown(text) {
  if (!text) return '<p></p>';
  
  // Xử lý code block trước tiên (để tránh format bên trong code)
  let html = text.replace(/```(.*?)\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = code
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<pre><code class="language-${lang}">${escaped}</code></pre>`;
  });
  
  // Xử lý bảng Markdown | header | header |
  html = html.replace(/(\|.*\|.*\|.*\n)+/g, (match) => {
    const rows = match.trim().split('\n');
    const isHeader = rows[0].includes('|');
    
    if (rows.length < 2) return match;
    
    const headers = rows[0].split('|').filter(h => h.trim());
    const hasSeperator = rows[1].split('|').some(cell => cell.includes('-'));
    
    if (!hasSeperator) return match;
    
    let tableHtml = '<table class="markdown-table"><thead><tr>';
    headers.forEach(header => {
      tableHtml += `<th>${header.trim()}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    for (let i = 2; i < rows.length; i++) {
      const cells = rows[i].split('|').filter(c => c.trim());
      if (cells.length > 0) {
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<td>${cell.trim()}</td>`;
        });
        tableHtml += '</tr>';
      }
    }
    tableHtml += '</tbody></table>';
    return tableHtml;
  });
  
  html = html
    // Tiêu đề: # / ## / ###
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // In đậm: **text** hoặc __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // In nghiêng: *text* hoặc _text_
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Link: [text](url)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Đổi dòng thành <br>
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<p>${html}</p>`;
}

// Read file -> dataURL, then resize/compress to fit within maxW/H
async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
}
async function resizeDataUrl(dataUrl, maxW=1280, maxH=1280, mime='image/webp', quality=0.9){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = () => {
      let {width:w, height:h} = img;
      const ratio = Math.min(maxW/w, maxH/h, 1);
      const cw = Math.round(w*ratio), ch = Math.round(h*ratio);
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        const out = canvas.toDataURL(mime, quality);
        res(out || dataUrl);
      } catch { res(dataUrl); }
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
}

// ===== storage =====
const loadPosts = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); } catch { return []; } };
const savePosts = list => localStorage.setItem(LS_KEY, JSON.stringify(list));
const upsertPost = p => { const all = loadPosts(); const i = all.findIndex(x=>x.id===p.id); if(i>=0) all[i]=p; else all.unshift(p); savePosts(all); };
const deletePost = id => savePosts(loadPosts().filter(p=>p.id!==id));
const findBySlug = slug => loadPosts().find(p=>p.slug===slug);

// ===== common init =====
window.addEventListener('DOMContentLoaded', () => {
  byId('year') && (byId('year').textContent = new Date().getFullYear());
  const navToggle = $('.nav-toggle'), navList = $('.nav-list');
  if (navToggle && navList) navToggle.addEventListener('click', () => navList.classList.toggle('show'));

  const page = document.body.dataset.page;
  if (page === 'blog-list')   initBlogList();
  if (page === 'blog-editor') initBlogEditor();
  if (page === 'blog-post')   initBlogPost();
  if (page === 'blog')        initBlogOnePage(); // tương thích chế độ 1 trang cũ
});

// ===== BLOG: danh sách =====
function initBlogList(){
  const listEl = byId('postsList');
  const tpl = byId('postItemTpl');
  const search = byId('searchInput');

  function render(posts){
    if (!listEl) return;
    listEl.innerHTML = '';
    posts.forEach(p => {
      const node = tpl?.content ? tpl.content.cloneNode(true) : null;

      if (node){
        const a = $('.post-title', node);
        const excerpt = $('.post-excerpt', node);
        const date = $('.post-date', node);
        const btnView = $('[data-view]', node);
        const btnEdit = $('[data-edit]', node);
        const btnDelete = $('[data-delete]', node);
        const thumb = $('.post-thumb', node);

        a.textContent = p.title;
        a.href = `post.html?slug=${encodeURIComponent(p.slug)}`;
        excerpt.innerHTML = parseSimpleMarkdown(p.content.length > 140 ? p.content.slice(0,140) + '…' : p.content);
        date.textContent = fmtDate(p.updatedAt || p.createdAt);
        if (btnView) btnView.href = `post.html?slug=${encodeURIComponent(p.slug)}`;
        if (btnEdit) btnEdit.href = `editor.html?slug=${encodeURIComponent(p.slug)}`;
        if (btnDelete) btnDelete.addEventListener('click', () => {
          if (confirm('Xoá bài này?')){ deletePost(p.id); refresh(); }
        });

        if (thumb){
          if (p.imageData){
            thumb.src = p.imageData;
            thumb.style.display = 'block';
            thumb.alt = p.imageAlt || '';
          } else {
            thumb.style.display = 'none';
          }
        }
        listEl.appendChild(node);
      } else {
        const art = document.createElement('article');
        art.className = 'post-item';
        const thumbImg = p.imageData ? `<img class="post-thumb" src="${p.imageData}" alt="">` : `<img class="post-thumb" alt="" style="display:none">`;
        art.innerHTML = `
          ${thumbImg}
          <a class="post-title" href="post.html?slug=${encodeURIComponent(p.slug)}">${p.title}</a>
          <div class="post-excerpt">${parseSimpleMarkdown(p.content.length > 140 ? p.content.slice(0,140) + '…' : p.content)}</div>
          <div class="meta-row">
            <span class="post-date">${fmtDate(p.updatedAt || p.createdAt)}</span>
            <div class="gap"></div>
            <a class="btn small outline" href="post.html?slug=${encodeURIComponent(p.slug)}">Đọc</a>
            <a class="btn small" href="editor.html?slug=${encodeURIComponent(p.slug)}">Sửa</a>
            <button class="btn small danger" type="button" data-del="${p.id}">Xoá</button>
          </div>`;
        listEl.appendChild(art);
        art.querySelector('[data-del]')?.addEventListener('click', () => {
          if (confirm('Xoá bài này?')){ deletePost(p.id); refresh(); }
        });
      }
    });
  }

  function refresh(){
    const q = (search?.value || '').toLowerCase().trim();
    const posts = loadPosts();
    const filtered = q ? posts.filter(p => p.title.toLowerCase().includes(q)) : posts;
    render(filtered);
  }

  search?.addEventListener('input', refresh);
  refresh();
}

// ===== BLOG: editor (viết/sửa) =====
function initBlogEditor(){
  const form = byId('postForm');
  const title = byId('postTitle');
  const content = byId('postContent');
  const postId = byId('postId');
  const fileInput = byId('postImage');
  const dropZone = byId('imageDrop');
  const preview = byId('imagePreview');
  const clearBtn = byId('clearImage');

  let currentImageData = ''; // base64 data URL
  let currentImageAlt = '';  // có thể dùng title làm alt

  // Nếu ?slug=... thì nạp để sửa
  const slug = getParam('slug');
  if (slug){
    const p = findBySlug(slug);
    if (p){
      postId.value = p.id;
      title.value = p.title;
      content.value = p.content;
      if (p.imageData){
        currentImageData = p.imageData;
        currentImageAlt = p.imageAlt || '';
        renderPreview();
      }
    }
  }

  // Kéo & thả
  if (dropZone){
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith('image/')) await handleNewImageFile(f);
    });
  }

  // Chọn file
  fileInput?.addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('image/')) await handleNewImageFile(f);
    e.target.value = '';
  });

  clearBtn?.addEventListener('click', () => {
    currentImageData = '';
    currentImageAlt = '';
    renderPreview();
  });

  function renderPreview(){
    if (!preview) return;
    if (currentImageData){
      preview.innerHTML = `<img src="${currentImageData}" alt="">`;
    } else {
      preview.textContent = 'Chưa có ảnh';
    }
  }

  async function handleNewImageFile(file){
    try{
      const dataUrl = await fileToDataUrl(file);
      const resized = await resizeDataUrl(dataUrl, 1280, 1280, 'image/webp', 0.9);
      currentImageData = resized;
      currentImageAlt = title?.value?.trim() || file.name || '';
      renderPreview();
    }catch(err){
      alert('Không xử lý được ảnh. Vui lòng thử ảnh khác.');
      console.error(err);
    }
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = postId.value || uuid();
    const isNew = !postId.value;
    const prevCreated = loadPosts().find(x => x.id === id)?.createdAt;

    const post = {
      id,
      title: (title.value || '').trim(),
      slug: slugify(title.value || 'bai-viet'),
      content: (content.value || '').trim(),
      imageData: currentImageData || undefined,
      imageAlt: currentImageAlt || undefined,
      createdAt: isNew ? nowISO() : (prevCreated || nowISO()),
      updatedAt: nowISO()
    };
    upsertPost(post);
    location.href = `post.html?slug=${encodeURIComponent(post.slug)}`;
  });
}

// ===== BLOG: trang đọc 1 bài =====
function initBlogPost(){
  const hTitle = byId('postTitle');
  const pDate  = byId('postDate');
  const body   = byId('postBody');
  const edit   = byId('editLink');
  const cover  = byId('postCover');

  const slug = new URLSearchParams(location.search).get('slug');
  const p = slug ? findBySlug(slug) : null;

  if (!p){
    if (hTitle) hTitle.textContent = 'Không tìm thấy bài viết';
    if (body)   body.innerHTML = '<p>Liên kết không hợp lệ hoặc bài đã bị xoá.</p>';
    if (pDate)  pDate.textContent = '';
    if (edit)   edit.style.display = 'none';
    return;
  }

  hTitle && (hTitle.textContent = p.title);
  pDate  && (pDate.textContent  = fmtDate(p.updatedAt || p.createdAt));
  body   && (body.innerHTML     = parseSimpleMarkdown(p.content));
  edit   && (edit.href          = `editor.html?slug=${encodeURIComponent(p.slug)}`);

  if (cover){
    cover.classList.remove('portrait'); // reset class
    if (p.imageData){
      // tạo img và đo tỉ lệ để gắn class phù hợp
      const img = new Image();
      img.loading = 'lazy';
      img.alt = p.imageAlt || '';
      img.src = p.imageData;
      img.onload = () => {
        if (img.naturalHeight > img.naturalWidth) {
          cover.classList.add('portrait');  // ảnh dọc → fit theo chiều cao
        }
      };
      cover.innerHTML = ''; // clear cũ
      cover.appendChild(img);
      cover.style.display = '';  // hiển thị
    } else {
      cover.innerHTML = '';
      cover.style.display = 'none';
    }
  }
}


// ===== BLOG: chế độ 1 trang (tương thích) =====
function initBlogOnePage(){
  const form = byId('postForm');
  const title = byId('postTitle');
  const content = byId('postContent');
  const postId = byId('postId');
  const resetBtn = byId('resetBtn');
  const listEl = byId('postsList');
  const tpl = byId('postItemTpl');
  const search = byId('searchInput');
  const readerTitle = byId('readerTitle');
  const readerBody = byId('readerBody');

  // Optional ảnh: nếu trang đơn có input giống editor.html
  const fileInput = byId('postImage');
  const dropZone = byId('imageDrop');
  const preview = byId('imagePreview');
  const clearBtn = byId('clearImage');

  let currentImageData = '';
  let currentImageAlt = '';

  function renderPreview(){
    if (!preview) return;
    if (currentImageData) preview.innerHTML = `<img src="${currentImageData}" alt="">`;
    else preview.textContent = 'Chưa có ảnh';
  }

  if (dropZone){
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith('image/')) {
        const dataUrl = await fileToDataUrl(f);
        currentImageData = await resizeDataUrl(dataUrl, 1280, 1280, 'image/webp', 0.9);
        currentImageAlt = title?.value?.trim() || f.name || '';
        renderPreview();
      }
    });
  }
  fileInput?.addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('image/')){
      const dataUrl = await fileToDataUrl(f);
      currentImageData = await resizeDataUrl(dataUrl, 1280, 1280, 'image/webp', 0.9);
      currentImageAlt = title?.value?.trim() || f.name || '';
      renderPreview();
    }
    e.target.value = '';
  });
  clearBtn?.addEventListener('click', () => { currentImageData=''; currentImageAlt=''; renderPreview(); });

  function openReader(p){
    if (!readerTitle || !readerBody) return;
    readerTitle.textContent = p.title;
    readerBody.classList.remove('empty');
    readerBody.innerHTML = parseSimpleMarkdown(p.content);
  }

  function render(posts){
    if (!listEl) return;
    listEl.innerHTML = '';
    posts.forEach(p => {
      const node = tpl?.content ? tpl.content.cloneNode(true) : null;

      if (node){
        const a = $('.post-title', node);
        const excerpt = $('.post-excerpt', node);
        const date = $('.post-date', node);
        const editBtn = $('.edit-btn', node);
        const delBtn = $('.delete-btn', node);
        const thumb = $('.post-thumb', node);

        a.textContent = p.title;
        a.href = `#${p.slug}`;
        excerpt.innerHTML = parseSimpleMarkdown(p.content.length > 140 ? p.content.slice(0,140) + '…' : p.content);
        date.textContent = fmtDate(p.updatedAt || p.createdAt);

        if (thumb){
          if (p.imageData){ thumb.src = p.imageData; thumb.style.display='block'; }
          else thumb.style.display = 'none';
        }

        a.addEventListener('click', (e) => {
          e.preventDefault();
          openReader(p);
          history.replaceState({}, '', `#${p.slug}`);
        });

        editBtn?.addEventListener('click', () => {
          title.value = p.title;
          content.value = p.content;
          postId.value = p.id;
          currentImageData = p.imageData || '';
          currentImageAlt = p.imageAlt || '';
          renderPreview();
          title.focus();
          window.scrollTo({top:0, behavior:'smooth'});
        });

        delBtn?.addEventListener('click', () => {
          if (confirm('Xoá bài này?')){
            deletePost(p.id);
            refresh();
            if (location.hash.slice(1) === p.slug) {
              readerTitle.textContent = 'Xem bài';
              readerBody.classList.add('empty');
              readerBody.innerHTML = '<p>Đã xoá. Chọn bài khác để xem.</p>';
            }
          }
        });

        listEl.appendChild(node);
      } else {
        const art = document.createElement('article');
        art.className = 'post-item';
        const thumbImg = p.imageData ? `<img class="post-thumb" src="${p.imageData}" alt="">` : `<img class="post-thumb" alt="" style="display:none">`;
        art.innerHTML = `
          ${thumbImg}
          <a class="post-title" href="#${p.slug}">${p.title}</a>
          <div class="post-excerpt">${parseSimpleMarkdown(p.content.length > 140 ? p.content.slice(0,140) + '…' : p.content)}</div>
          <div class="meta-row">
            <span class="post-date">${fmtDate(p.updatedAt || p.createdAt)}</span>
            <div class="gap"></div>
            <button class="btn small outline" data-open>Đọc</button>
            <button class="btn small" data-edit>Sửa</button>
            <button class="btn small danger" data-del>Xoá</button>
          </div>`;
        listEl.appendChild(art);

        art.querySelector('[data-open]')?.addEventListener('click', () => {
          openReader(p);
          history.replaceState({}, '', `#${p.slug}`);
        });
        art.querySelector('[data-edit]')?.addEventListener('click', () => {
          title.value = p.title;
          content.value = p.content;
          postId.value = p.id;
          currentImageData = p.imageData || '';
          currentImageAlt = p.imageAlt || '';
          renderPreview();
          title.focus();
          window.scrollTo({top:0, behavior:'smooth'});
        });
        art.querySelector('[data-del]')?.addEventListener('click', () => {
          if (confirm('Xoá bài này?')){ deletePost(p.id); refresh(); }
        });
      }
    });
  }

  function refresh(){
    const q = (search?.value || '').toLowerCase().trim();
    const posts = loadPosts();
    const filtered = q ? posts.filter(p => p.title.toLowerCase().includes(q)) : posts;
    render(filtered);
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = postId.value || uuid();
    const isNew = !postId.value;
    const prevCreated = loadPosts().find(x => x.id === id)?.createdAt;

    const post = {
      id,
      title: (title.value || '').trim(),
      slug: slugify(title.value || 'bai-viet'),
      content: (content.value || '').trim(),
      imageData: currentImageData || undefined,
      imageAlt: currentImageAlt || undefined,
      createdAt: isNew ? nowISO() : (prevCreated || nowISO()),
      updatedAt: nowISO()
    };
    upsertPost(post);
    form.reset();
    currentImageData = ''; currentImageAlt = ''; renderPreview();
    refresh();
    openReader(post);
    history.replaceState({}, '', `#${post.slug}`);
  });

  resetBtn?.addEventListener('click', () => { postId.value=''; currentImageData=''; currentImageAlt=''; renderPreview(); });
  byId('searchInput')?.addEventListener('input', refresh);

  // lần đầu
  renderPreview();
  refresh();

  if (location.hash){
    const slug = location.hash.slice(1);
    const p = loadPosts().find(x => x.slug === slug);
    if (p) openReader(p);
  }
}