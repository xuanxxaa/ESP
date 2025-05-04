// 初始化LeanCloud (使用MasterKey)
AV.init({
	appId: "OPcY0ke4EHpxPgB20EvIZM1Z-gzGzoHsz",
	appKey: "N3OOBBscYVzRmr33mcU4Aut2",
	serverURL: "https://opcy0ke4.lc-cn-n1-shared.com",
	masterKey: "B5RxFvBexMn0W5SxYBqMXt3o"
});

// 管理员密码
const ADMIN_PASSWORD = "a";

// MQTT客户端
const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
	clientId: "admin-client-" + Math.random().toString(16).substr(2, 8)
});

// 验证管理员密码
function verifyAdmin() {
	const password = document.getElementById("admin-password").value;
	if (password === ADMIN_PASSWORD) {
		document.getElementById("password-form").style.display = "none";
		document.getElementById("auth-section").style.display = "block";
		loadVisitors();
		loadLogs();
		getLightStatus(true);
		showNotification("验证成功", true);
	} else {
		document.getElementById("login-status").textContent = "密码错误";
		document.getElementById("login-status").style.color = "red";
	}
}

// 分页配置
const paginationConfig = {
  visitors: {
    perPage: 5,
    currentPage: 1,
    totalItems: 0,
    container: 'visitor-pagination',
    infoContainer: 'visitor-pagination-info'
  },
  logs: {
    perPage: 10,
    currentPage: 1,
    totalItems: 0,
    container: 'log-pagination',
    infoContainer: 'log-pagination-info'
  }
};

// 初始化分页
async function initPagination() {
  await loadVisitors();
  await loadLogs();
}

// 生成分页按钮
function renderPagination(type) {
  const config = paginationConfig[type];
  const totalPages = Math.ceil(config.totalItems / config.perPage);
  const pagination = document.getElementById(config.container);
  const infoContainer = document.getElementById(config.infoContainer);
  
  pagination.innerHTML = '';
  
  // 显示分页信息
  infoContainer.textContent = `共 ${config.totalItems} 条，第 ${config.currentPage}/${totalPages} 页`;
  
  // 始终显示最多9个页码
  let startPage = Math.max(1, config.currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }
  
  // 上一页按钮
  const prevBtn = createPaginationItem('«', 'prev', config.currentPage === 1);
  prevBtn.addEventListener('click', () => {
    if (config.currentPage > 1) {
      config.currentPage--;
      if (type === 'visitors') loadVisitors();
      else loadLogs();
    }
  });
  pagination.appendChild(prevBtn);
  
  // 第一页和省略号
  if (startPage > 1) {
    const firstPage = createPaginationItem('1');
    firstPage.addEventListener('click', () => {
      config.currentPage = 1;
      if (type === 'visitors') loadVisitors();
      else loadLogs();
    });
    pagination.appendChild(firstPage);
    
    if (startPage > 2) {
      const ellipsis = createPaginationItem('...', 'ellipsis');
      pagination.appendChild(ellipsis);
    }
  }
  
  // 页码按钮
  for (let i = startPage; i <= endPage; i++) {
    const pageItem = createPaginationItem(
      i.toString(),
      i === config.currentPage ? 'active' : ''
    );
    
    if (i !== config.currentPage) {
      pageItem.addEventListener('click', () => {
        config.currentPage = i;
        if (type === 'visitors') loadVisitors();
        else loadLogs();
      });
    }
    
    pagination.appendChild(pageItem);
  }
  
  // 最后一页和省略号
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsis = createPaginationItem('...', 'ellipsis');
      pagination.appendChild(ellipsis);
    }
    
    const lastPage = createPaginationItem(totalPages.toString());
    lastPage.addEventListener('click', () => {
      config.currentPage = totalPages;
      if (type === 'visitors') loadVisitors();
      else loadLogs();
    });
    pagination.appendChild(lastPage);
  }
  
  // 下一页按钮
  const nextBtn = createPaginationItem('»', 'next', config.currentPage === totalPages);
  nextBtn.addEventListener('click', () => {
    if (config.currentPage < totalPages) {
      config.currentPage++;
      if (type === 'visitors') loadVisitors();
      else loadLogs();
    }
  });
  pagination.appendChild(nextBtn);
}

// 创建分页项
function createPaginationItem(text, className = '', disabled = false) {
  const li = document.createElement('li');
  li.className = `page-item ${className} ${disabled ? 'disabled' : ''}`;
  li.textContent = text;
  return li;
}

// 加载访客权限列表
async function loadVisitors() {
  try {
    const query = new AV.Query('VisitorAuth');
    query.descending('expire_time');
    
    // 分页逻辑
    const { currentPage, perPage } = paginationConfig.visitors;
    query.limit(perPage);
    query.skip((currentPage - 1) * perPage);
    
    const count = await query.count();
    paginationConfig.visitors.totalItems = count;
    
    const visitors = await query.find();
    const tbody = document.querySelector("#visitor-table tbody");
    tbody.innerHTML = "";
    
    visitors.forEach(visitor => {
		const row = document.createElement("tr");
		const expireTime = new Date(visitor.get('expire_time'));
		const isExpired = Date.now() > expireTime.getTime();
		
		row.innerHTML = `
			<td>${visitor.get('visitor_id')}</td>
			<td>${expireTime.toLocaleString()}</td>
			<td>
				<span class="badge ${isExpired ? 'badge-danger' : 'badge-success'}">
					${isExpired ? '已过期' : '有效'}
				</span>
			</td>
			<td>
				<button class="btn-danger" onclick="deleteVisitor('${visitor.id}')">删除</button>
			</td>
		`;
		tbody.appendChild(row);
    });
    
    renderPagination('visitors');
  } catch (err) {
    console.error("加载访客列表失败:", err);
  }
}

// 添加访客权限
async function addVisitor() {
    const visitorId = document.getElementById("new-visitor-id").value.trim();
    const minutes = parseInt(document.getElementById("expire-minutes").value);
    
    if (!visitorId || isNaN(minutes)) {
        showNotification("请输入有效的访客ID和有效期", false);
        return;
    }
    
    try {
        // 启用MasterKey权限查询
        const query = new AV.Query('VisitorAuth');
        query.equalTo('visitor_id', visitorId);
        const exists = await query.find({ useMasterKey: true });
        
        if (exists.length > 0) {
            // 存在则更新有效期（启用MasterKey）
            exists[0].set('expire_time', new Date(Date.now() + minutes * 60000));
            await exists[0].save(null, { useMasterKey: true });
            showNotification("该访客有效期已更新", true);
        } else {
            // 不存在则新建（启用MasterKey）
            const VisitorAuth = AV.Object.extend('VisitorAuth');
            const newVisitor = new VisitorAuth();
            newVisitor.set('visitor_id', visitorId);
            newVisitor.set('expire_time', new Date(Date.now() + minutes * 60000));
            await newVisitor.save(null, { useMasterKey: true });
            showNotification("访客添加成功", true);
        }
        
        document.getElementById("new-visitor-id").value = "";
        loadVisitors();
    } catch (err) {
        console.error("操作失败:", err);
        showNotification("操作失败: " + err.message, false);
    }
}

// 删除访客权限
async function deleteVisitor(objectId) {
  if (!confirm("确定要删除此访客权限吗？")) return;
  
  try {
	const visitor = AV.Object.createWithoutData('VisitorAuth', objectId);
	
	await visitor.destroy({ 
	  useMasterKey: true 
	});
	
	loadVisitors();
	showNotification("访客删除成功", true);
	console.log("删除成功");
  } catch (err) {
	console.error("删除失败:", err);
	showNotification("删除失败: " + err.message, false);
  }
}

// 加载操作记录
async function loadLogs() {
  try {
    const searchId = document.getElementById("search-visitor").value.trim();
    const query = new AV.Query('MQTT');
    query.descending('createdAt');
    
    // 分页逻辑
    const { currentPage, perPage } = paginationConfig.logs;
    query.limit(perPage);
    query.skip((currentPage - 1) * perPage);
    
    if (searchId) {
      // 改用包含查询（模糊匹配）
      query.contains('visitor_id', searchId);
      // 或者使用正则表达式实现更灵活的匹配（需LeanCloud支持）
      // query.matches('visitor_id', new RegExp(searchId, 'i'));
    }
    
    const count = await query.count();
    paginationConfig.logs.totalItems = count;
    
    const logs = await query.find();
    const tbody = document.querySelector("#log-table tbody");
    tbody.innerHTML = "";
    
    logs.forEach(log => {
      const visitorId = log.get('visitor_id') || '未知';
      const command = log.get('command');
      const timestamp = new Date(log.createdAt).toLocaleString();
      
      // 高亮匹配部分（如果搜索词不为空）
      let highlightedId = visitorId;
      if (searchId) {
        const regex = new RegExp(`(${escapeRegExp(searchId)})`, 'gi');
        highlightedId = visitorId.replace(regex, '<span class="highlight">$1</span>');
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${timestamp}</td>
        <td>${highlightedId}</td>
        <td>${command}</td>
        <td>
          <div class="action-menu">
            <div class="menu-trigger" onclick="toggleMenu(this)"></div>
            <div class="menu-options">
              <div class="menu-option delete" onclick="deleteLog('${log.id}', event)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right:8px">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                删除
              </div>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    renderPagination('logs');
  } catch (err) {
    console.error("加载日志失败:", err);
  }
}

// 辅助函数：转义正则表达式特殊字符
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 初始化时调用
initPagination();

// 显示悬浮通知
function showNotification(message, isSuccess) {
  const notification = document.createElement('div');
  notification.className = `notification ${isSuccess ? 'success' : 'error'}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // 显示通知
  setTimeout(() => {
	notification.classList.add('show');
  }, 10);
  
  // 3秒后自动消失
  setTimeout(() => {
	notification.classList.remove('show');
	setTimeout(() => {
	  notification.remove();
	}, 300);
  }, 3000);
}

// 切换下拉菜单
function toggleMenu(trigger) {
  event.stopPropagation();
  const menu = trigger.closest('.action-menu');
  const allMenus = document.querySelectorAll('.action-menu');
  
  allMenus.forEach(m => {
	if (m !== menu) m.classList.remove('active');
  });
  
  menu.classList.toggle('active');
}

// 点击页面其他位置关闭菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.action-menu')) {
	document.querySelectorAll('.action-menu').forEach(m => {
	  m.classList.remove('active');
	});
  }
});

// 删除日志记录
async function deleteLog(objectId, event) {
  event.stopPropagation();
  
  try {
	const log = AV.Object.createWithoutData('MQTT', objectId);
	await log.destroy({ useMasterKey: true });
	
	showNotification('删除成功', true);
	loadLogs();
	event.target.closest('.action-menu').classList.remove('active');
  } catch (err) {
	console.error("删除失败:", err);
	showNotification('删除失败: ' + err.message, false);
  }
}

// 点击页面其他位置关闭所有下拉菜单
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown').forEach(d => {
	d.classList.remove('show');
  });
});

// 清除搜索
function clearSearch() {
	document.getElementById("search-visitor").value = "";
	loadLogs();
	showNotification("搜索条件已重置", true);
}

// 灯光控制
async function sendCommand(cmd) {
	try {
		client.publish("home/led", cmd);
		
		// 记录管理员操作
		const Log = new AV.Object('MQTT');
		Log.set('visitor_id', 'admin');
		Log.set('command', cmd);
		Log.set('type', 'admin_action');
		await Log.save();
		
		updateLightStatus(cmd);
		
		if (cmd === 'on') {
			showNotification("灯光已开启",true);
		} else {
			showNotification("灯光已关闭",false);
		}

	} catch (err) {
		console.error("发送指令失败:", err);
		showNotification("指令发送失败", false);
	}
}

// 获取灯光状态
function getLightStatus(silent = false) {
	client.publish("home/led/get_status", "");
	
	if (!silent) {
        showNotification("状态刷新成功", true);
    }
	
	// 从日志获取最新状态
	const logQuery = new AV.Query('MQTT');
	logQuery.descending('createdAt');
	logQuery.limit(1);
	logQuery.find().then(lastLog => {
		if (lastLog[0]) {
			updateLightStatus(lastLog[0].get('command'));
		}
	});
}

// 更新灯光状态显示
function updateLightStatus(status) {
	const statusEl = document.getElementById("light-status");
	const textEl = document.getElementById("status-text");
	
	statusEl.className = 'status-indicator';
	if (status === 'on') {
		statusEl.classList.add('status-on');
		textEl.textContent = '开启';
	} else if (status === 'off') {
		statusEl.classList.add('status-off');
		textEl.textContent = '关闭';
	} else {
		textEl.textContent = '未知';
	}
}

// MQTT消息处理
client.on("connect", () => {
	console.log("MQTT已连接");
	client.subscribe("home/led/status");
});

client.on("message", (topic, message) => {
	if (topic === "home/led/status") {
		updateLightStatus(message.toString());
	}
});

// 输入框回车触发
document.getElementById("admin-password").addEventListener("keypress", (e) => {
	if (e.key === "Enter") verifyAdmin();
});