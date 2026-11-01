#![cfg(target_os = "windows")]

use super::{vcp, MonitorInfo};
use std::ffi::{c_char, c_void, CStr};
use std::ptr::{null, null_mut};
use std::sync::OnceLock;
use std::thread::sleep;
use std::time::Duration;

type HMODULE = *mut c_void;
type HMONITOR = *mut c_void;
type HDC = *mut c_void;
type LPRECT = *mut c_void;
type LPARAM = isize;
type BOOL = i32;
type DWORD = u32;
type BYTE = u8;
type HANDLE = *mut c_void;
type HKEY = *mut c_void;
type LSTATUS = i32;

const HKEY_CURRENT_USER: HKEY = (-2147483647_isize) as *mut c_void;
const KEY_READ: DWORD = 0x20019;
const KEY_WRITE: DWORD = 0x20006;
const REG_SZ: DWORD = 1;
const ERROR_SUCCESS: LSTATUS = 0;

#[link(name = "advapi32")]
unsafe extern "system" {
    fn RegOpenKeyExW(
        h_key: HKEY,
        lp_sub_key: *const u16,
        ul_options: DWORD,
        sam_desired: DWORD,
        phk_result: *mut HKEY,
    ) -> LSTATUS;

    fn RegCreateKeyExW(
        h_key: HKEY,
        lp_sub_key: *const u16,
        reserved: DWORD,
        lp_class: *mut u16,
        dw_options: DWORD,
        sam_desired: DWORD,
        lp_security_attributes: *mut c_void,
        phk_result: *mut HKEY,
        lpdw_disposition: *mut DWORD,
    ) -> LSTATUS;

    fn RegQueryValueExW(
        h_key: HKEY,
        lp_value_name: *const u16,
        lp_reserved: *mut DWORD,
        lp_type: *mut DWORD,
        lp_data: *mut u8,
        lpcb_data: *mut DWORD,
    ) -> LSTATUS;

    fn RegSetValueExW(
        h_key: HKEY,
        lp_value_name: *const u16,
        reserved: DWORD,
        dw_type: DWORD,
        lp_data: *const u8,
        cb_data: DWORD,
    ) -> LSTATUS;

    fn RegCloseKey(h_key: HKEY) -> LSTATUS;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn LoadLibraryW(lp_lib_file_name: *const u16) -> HMODULE;
    fn GetProcAddress(h_module: HMODULE, lp_proc_name: *const u8) -> *mut c_void;
    fn GlobalAlloc(u_flags: u32, dw_bytes: usize) -> *mut c_void;
    fn GlobalFree(h_mem: *mut c_void) -> *mut c_void;
}

// ============================================================================
// Windows DisplayConfig API (HDR10 Nativo no Windows 10/11)
// ============================================================================
const QDC_ONLY_ACTIVE_PATHS: u32 = 0x0000_0002;
const DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME: u32 = 2;
const DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO: u32 = 9;
const DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE: u32 = 10;

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct Luid {
    low_part: u32,
    high_part: i32,
}

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct DisplayConfigPathSourceInfo {
    adapter_id: Luid,
    id: u32,
    mode_info_idx: u32,
    status_flags: u32,
}

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct DisplayConfigRational {
    numerator: u32,
    denominator: u32,
}

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct DisplayConfigPathTargetInfo {
    adapter_id: Luid,
    id: u32,
    mode_info_idx: u32,
    output_technology: u32,
    rotation: u32,
    scaling: u32,
    refresh_rate: DisplayConfigRational,
    scan_line_ordering: u32,
    target_available: BOOL,
    status_flags: u32,
}

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct DisplayConfigPathInfo {
    source_info: DisplayConfigPathSourceInfo,
    target_info: DisplayConfigPathTargetInfo,
    flags: u32,
}

#[repr(C, align(8))]
#[derive(Copy, Clone)]
struct DisplayConfigModeInfo([u8; 64]);

impl Default for DisplayConfigModeInfo {
    fn default() -> Self {
        Self([0u8; 64])
    }
}

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct DisplayConfigDeviceInfoHeader {
    info_type: u32,
    size: u32,
    adapter_id: Luid,
    id: u32,
}

#[repr(C)]
struct DisplayConfigTargetDeviceName {
    header: DisplayConfigDeviceInfoHeader,
    flags: u32,
    output_technology: u32,
    edid_manufacture_id: u16,
    edid_product_code_id: u16,
    connector_instance: u32,
    monitor_friendly_device_name: [u16; 64],
    monitor_device_path: [u16; 128],
}

#[repr(C)]
#[derive(Default)]
struct DisplayConfigGetAdvancedColorInfo {
    header: DisplayConfigDeviceInfoHeader,
    value: u32, // bit0 = supported, bit1 = enabled
    color_encoding: u32,
    bits_per_color_channel: u32,
}

#[repr(C)]
#[derive(Default)]
struct DisplayConfigSetAdvancedColorState {
    header: DisplayConfigDeviceInfoHeader,
    value: u32, // bit0 = enableAdvancedColor
}

type EnumMonitorsProc = unsafe extern "system" fn(HMONITOR, HDC, LPRECT, LPARAM) -> BOOL;

#[link(name = "user32")]
unsafe extern "system" {
    fn EnumDisplayMonitors(
        hdc: HDC,
        lprc_clip: LPRECT,
        lpfn_enum: EnumMonitorsProc,
        dw_data: LPARAM,
    ) -> BOOL;

    fn GetDisplayConfigBufferSizes(
        flags: u32,
        num_path_array_elements: *mut u32,
        num_mode_info_array_elements: *mut u32,
    ) -> i32;

    fn QueryDisplayConfig(
        flags: u32,
        num_path_array_elements: *mut u32,
        path_array: *mut DisplayConfigPathInfo,
        num_mode_info_array_elements: *mut u32,
        mode_info_array: *mut DisplayConfigModeInfo,
        current_topology_id: *mut c_void,
    ) -> i32;

    fn DisplayConfigGetDeviceInfo(request_packet: *mut DisplayConfigDeviceInfoHeader) -> i32;
    fn DisplayConfigSetDeviceInfo(set_packet: *mut DisplayConfigDeviceInfoHeader) -> i32;
}

// ============================================================================
// DXVA2 Fallback Dinâmico (caso o sistema não tenha GPU AMD Radeon)
// ============================================================================
#[repr(C)]
struct PhysicalMonitor {
    h_physical_monitor: HANDLE,
    sz_physical_monitor_description: [u16; 128],
}

struct Dxva2Api {
    _h_module: HMODULE,
    get_num_monitors: unsafe extern "system" fn(HMONITOR, *mut DWORD) -> BOOL,
    get_physical_monitors: unsafe extern "system" fn(HMONITOR, DWORD, *mut PhysicalMonitor) -> BOOL,
    destroy_physical_monitors: unsafe extern "system" fn(DWORD, *mut PhysicalMonitor) -> BOOL,
    get_vcp: unsafe extern "system" fn(HANDLE, BYTE, *mut DWORD, *mut DWORD, *mut DWORD) -> BOOL,
    set_vcp: unsafe extern "system" fn(HANDLE, BYTE, DWORD) -> BOOL,
}

unsafe impl Send for Dxva2Api {}
unsafe impl Sync for Dxva2Api {}

static DXVA2: OnceLock<Option<Dxva2Api>> = OnceLock::new();

fn get_dxva2() -> Option<&'static Dxva2Api> {
    DXVA2
        .get_or_init(|| unsafe {
            let name: Vec<u16> = "dxva2.dll\0".encode_utf16().collect();
            let h = LoadLibraryW(name.as_ptr());
            if h.is_null() {
                return None;
            }
            let p_get_num = GetProcAddress(h, b"GetNumberOfPhysicalMonitorsFromHMONITOR\0".as_ptr());
            let p_get_phys = GetProcAddress(h, b"GetPhysicalMonitorsFromHMONITOR\0".as_ptr());
            let p_destroy = GetProcAddress(h, b"DestroyPhysicalMonitors\0".as_ptr());
            let p_get_vcp = GetProcAddress(h, b"GetVCPFeatureAndVCPFeatureReply\0".as_ptr());
            let p_set_vcp = GetProcAddress(h, b"SetVCPFeature\0".as_ptr());

            if p_get_num.is_null()
                || p_get_phys.is_null()
                || p_destroy.is_null()
                || p_get_vcp.is_null()
                || p_set_vcp.is_null()
            {
                return None;
            }

            Some(Dxva2Api {
                _h_module: h,
                get_num_monitors: std::mem::transmute(p_get_num),
                get_physical_monitors: std::mem::transmute(p_get_phys),
                destroy_physical_monitors: std::mem::transmute(p_destroy),
                get_vcp: std::mem::transmute(p_get_vcp),
                set_vcp: std::mem::transmute(p_set_vcp),
            })
        })
        .as_ref()
}

// ============================================================================
// AMD ADL (atiadlxx.dll) — Raw I2C DDC/CI para Standard + TPV Extended VCPs
// ============================================================================
type AdlMainMallocCallback = unsafe extern "C" fn(i32) -> *mut c_void;
type AdlMainControlCreateFn = unsafe extern "C" fn(AdlMainMallocCallback, i32) -> i32;
type AdlMainControlDestroyFn = unsafe extern "C" fn() -> i32;
type AdlAdapterNumberOfAdaptersGetFn = unsafe extern "C" fn(*mut i32) -> i32;
type AdlAdapterAdapterInfoGetFn = unsafe extern "C" fn(*mut AdlAdapterInfo, i32) -> i32;
type AdlDisplayDisplayInfoGetFn =
    unsafe extern "C" fn(i32, *mut i32, *mut *mut AdlDisplayInfo, i32) -> i32;
type AdlDisplayDdcBlockAccessGetFn =
    unsafe extern "C" fn(i32, i32, i32, i32, i32, *mut c_void, *mut i32, *mut c_void) -> i32;

#[repr(C)]
#[derive(Copy, Clone)]
struct AdlAdapterInfo {
    i_size: i32,
    i_adapter_index: i32,
    str_udid: [u8; 256],
    i_bus_number: i32,
    i_device_number: i32,
    i_function_number: i32,
    i_vendor_id: i32,
    str_adapter_name: [u8; 256],
    str_display_name: [u8; 256],
    i_present: i32,
    i_exist: i32,
    str_driver_path: [u8; 256],
    str_driver_path_ext: [u8; 256],
    str_pnp_string: [u8; 256],
    i_os_display_index: i32,
}

impl Default for AdlAdapterInfo {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

#[repr(C)]
#[derive(Copy, Clone)]
struct AdlDisplayId {
    i_display_logical_index: i32,
    i_display_physical_index: i32,
    i_display_logical_adapter_index: i32,
    i_display_physical_adapter_index: i32,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct AdlDisplayInfo {
    display_id: AdlDisplayId,
    i_display_controller_index: i32,
    str_display_name: [u8; 256],
    str_display_manufacturer_name: [u8; 256],
    i_display_type: i32,
    i_display_output_type: i32,
    i_display_connector: i32,
    i_display_info_mask: i32,
    i_display_info_value: i32,
}

unsafe extern "C" fn adl_malloc_cb(size: i32) -> *mut c_void {
    if size <= 0 {
        return null_mut();
    }
    unsafe { GlobalAlloc(0x0040, size as usize) }
}

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn c_bytes_to_string(buf: &[u8]) -> String {
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[..end]).trim().to_string()
}

fn u16_buf_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|&w| w == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end]).trim().to_string()
}

fn is_aoc_target_name(name: &str) -> bool {
    let up = name.to_ascii_uppercase();
    up.contains("24G2") || up.contains("AOC")
}

struct AdlBackend {
    fn_destroy: AdlMainControlDestroyFn,
    fn_num_adapters: AdlAdapterNumberOfAdaptersGetFn,
    fn_adapter_info: AdlAdapterAdapterInfoGetFn,
    fn_display_info: AdlDisplayDisplayInfoGetFn,
    fn_ddc_block: AdlDisplayDdcBlockAccessGetFn,
    adapter_idx: i32,
    display_idx: i32,
    display_name: String,
}

impl Drop for AdlBackend {
    fn drop(&mut self) {
        unsafe {
            let _ = (self.fn_destroy)();
        }
    }
}

impl AdlBackend {
    unsafe fn load() -> Result<Self, String> {
        unsafe {
            let mut h_mod = LoadLibraryW(wide_null("atiadlxx.dll").as_ptr());
            if h_mod.is_null() {
                h_mod = LoadLibraryW(wide_null("atiadlxy.dll").as_ptr());
            }
            if h_mod.is_null() {
                return Err("atiadlxx.dll não encontrada".to_string());
            }

            macro_rules! proc {
                ($name:literal, $ty:ty) => {{
                    let p = GetProcAddress(h_mod, concat!($name, "\0").as_ptr());
                    if p.is_null() {
                        return Err(format!("Símbolo {} ausente na ADL", $name));
                    }
                    std::mem::transmute::<*mut c_void, $ty>(p)
                }};
            }

            let fn_create = proc!("ADL_Main_Control_Create", AdlMainControlCreateFn);
            let fn_destroy = proc!("ADL_Main_Control_Destroy", AdlMainControlDestroyFn);
            let fn_num_adapters =
                proc!("ADL_Adapter_NumberOfAdapters_Get", AdlAdapterNumberOfAdaptersGetFn);
            let fn_adapter_info = proc!("ADL_Adapter_AdapterInfo_Get", AdlAdapterAdapterInfoGetFn);
            let fn_display_info = proc!("ADL_Display_DisplayInfo_Get", AdlDisplayDisplayInfoGetFn);
            let fn_ddc_block =
                proc!("ADL_Display_DDCBlockAccess_Get", AdlDisplayDdcBlockAccessGetFn);

            let rc = fn_create(adl_malloc_cb, 1);
            if rc != 0 {
                return Err(format!("ADL_Main_Control_Create falhou: {}", rc));
            }

            let mut backend = Self {
                fn_destroy,
                fn_num_adapters,
                fn_adapter_info,
                fn_display_info,
                fn_ddc_block,
                adapter_idx: 0,
                display_idx: 0,
                display_name: String::new(),
            };

            backend.select_aoc_display()?;
            Ok(backend)
        }
    }

    unsafe fn select_aoc_display(&mut self) -> Result<(), String> {
        unsafe {
            let mut num_adapters: i32 = 0;
            if (self.fn_num_adapters)(&mut num_adapters) != 0 || num_adapters <= 0 {
                return Err("Nenhum adaptador AMD ADL encontrado".to_string());
            }

            let mut adapters = vec![AdlAdapterInfo::default(); num_adapters as usize];
            let total_bytes = (num_adapters as usize) * std::mem::size_of::<AdlAdapterInfo>();
            if (self.fn_adapter_info)(adapters.as_mut_ptr(), total_bytes as i32) != 0 {
                return Err("ADL_Adapter_AdapterInfo_Get falhou".to_string());
            }

            let mut candidates: Vec<(i32, i32, String)> = Vec::new();
            for ai in &adapters {
                if ai.i_present == 0 {
                    continue;
                }
                let mut num_disp: i32 = 0;
                let mut disp_ptr: *mut AdlDisplayInfo = null_mut();
                let rc = (self.fn_display_info)(ai.i_adapter_index, &mut num_disp, &mut disp_ptr, 0);
                if rc != 0 || num_disp <= 0 || disp_ptr.is_null() {
                    continue;
                }

                let slice = std::slice::from_raw_parts(disp_ptr, num_disp as usize);
                for di in slice {
                    // ADL_DISPLAY_DISPLAYINFO_DISPLAYCONNECTED = 0x1
                    if (di.i_display_info_value & 1) == 0 {
                        continue;
                    }
                    let a_idx = di.display_id.i_display_logical_adapter_index;
                    let d_idx = di.display_id.i_display_logical_index;
                    if candidates.iter().any(|&(a, d, _)| a == a_idx && d == d_idx) {
                        continue;
                    }
                    let dname = c_bytes_to_string(&di.str_display_name);
                    candidates.push((a_idx, d_idx, dname));
                }
                let _ = GlobalFree(disp_ptr as *mut c_void);
            }

            if candidates.is_empty() {
                return Err("Nenhum monitor conectado na GPU AMD".to_string());
            }

            // Prioriza monitores AOC / 24G2
            candidates.sort_by_key(|(_, _, name)| if is_aoc_target_name(name) { 0 } else { 1 });

            for (a_idx, d_idx, name) in &candidates {
                self.adapter_idx = *a_idx;
                self.display_idx = *d_idx;
                if self.get_std_vcp(vcp::BRIGHTNESS).is_ok() {
                    self.display_name = name.clone();
                    return Ok(());
                }
            }

            // Se a leitura inicial estiver ocupada, mantém o candidato principal (AOC)
            self.adapter_idx = candidates[0].0;
            self.display_idx = candidates[0].1;
            self.display_name = candidates[0].2.clone();
            Ok(())
        }
    }

    unsafe fn raw_write(&self, payload: &[u8], settle_ms: u64) -> Result<(), String> {
        let mut send_buf = Vec::with_capacity(payload.len() + 4);
        send_buf.push(0x6E);
        send_buf.push(0x51);
        send_buf.push(0x80 | (payload.len() as u8));
        send_buf.extend_from_slice(payload);

        let mut chk: u8 = 0x6E;
        for &b in &send_buf[1..] {
            chk ^= b;
        }
        send_buf.push(chk);

        let mut rlen: i32 = 0;
        let rc = unsafe {
            (self.fn_ddc_block)(
                self.adapter_idx,
                self.display_idx,
                0,
                0,
                send_buf.len() as i32,
                send_buf.as_mut_ptr() as *mut c_void,
                &mut rlen,
                null_mut(),
            )
        };
        sleep(Duration::from_millis(settle_ms));
        if rc == 0 {
            Ok(())
        } else {
            Err(format!("ADL I2C write falhou (rc={})", rc))
        }
    }

    unsafe fn raw_read_vcp_reply(&self) -> Result<[u8; 11], String> {
        let mut send_addr = [0x6Fu8];
        let mut rlen: i32 = 11;
        let mut rbuf = [0u8; 11];
        let rc = unsafe {
            (self.fn_ddc_block)(
                self.adapter_idx,
                self.display_idx,
                0,
                0,
                1,
                send_addr.as_mut_ptr() as *mut c_void,
                &mut rlen,
                rbuf.as_mut_ptr() as *mut c_void,
            )
        };
        sleep(Duration::from_millis(45));
        if rc != 0 {
            return Err(format!("ADL I2C read falhou (rc={})", rc));
        }
        if rbuf[0] != 0x6E || (rbuf[1] & 0x80) == 0 {
            return Err("Cabeçalho DDC/CI inválido".to_string());
        }
        let body_len = (rbuf[1] & 0x7F) as usize;
        if body_len != 8 {
            return Err(format!("Monitor ocupado (len={})", body_len));
        }
        let mut chk: u8 = 0x50;
        for &b in &rbuf[..11] {
            chk ^= b;
        }
        if chk != 0 {
            return Err("Checksum DDC/CI inválido".to_string());
        }
        Ok(rbuf)
    }

    fn get_std_vcp(&self, code: u8) -> Result<(u32, u32), String> {
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(90));
            }
            unsafe {
                if let Err(e) = self.raw_write(&[0x01, code], 65) {
                    last_err = e;
                    continue;
                }
                match self.raw_read_vcp_reply() {
                    Ok(raw) => {
                        if raw[3] != 0 {
                            return Err(format!("VCP 0x{:02X} não suportado", code));
                        }
                        let max = ((raw[6] as u32) << 8) | (raw[7] as u32);
                        let cur = ((raw[8] as u32) << 8) | (raw[9] as u32);
                        return Ok((cur, max));
                    }
                    Err(e) => last_err = e,
                }
            }
        }
        Err(last_err)
    }

    fn set_std_vcp(&self, code: u8, value: u32) -> Result<(), String> {
        let hi = ((value >> 8) & 0xFF) as u8;
        let lo = (value & 0xFF) as u8;
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(100));
            }
            match unsafe { self.raw_write(&[0x03, code, hi, lo], 185) } {
                Ok(()) => return Ok(()),
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }

    fn get_tpv_vcp(&self, b1: u8, b2: u8, b3: u8) -> Result<(u32, u32), String> {
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(90));
            }
            unsafe {
                if let Err(e) = self.raw_write(&[0x01, b1, b2, b3], 70) {
                    last_err = e;
                    continue;
                }
                match self.raw_read_vcp_reply() {
                    Ok(raw) => {
                        if raw[3] != 0 {
                            return Err(format!(
                                "TPV {:02X} {:02X} {:02X} não suportado",
                                b1, b2, b3
                            ));
                        }
                        // No AOC 24G2S, opcodes F8 E1 válidos retornam tag 0xFE 0x01
                        if b1 == 0xF8 && b2 == 0xE1 && !(raw[4] == 0xFE && raw[5] == 0x01) {
                            return Err(format!("TPV F8 E1 {:02X} indisponível", b3));
                        }
                        let max = ((raw[6] as u32) << 8) | (raw[7] as u32);
                        let cur = ((raw[8] as u32) << 8) | (raw[9] as u32);
                        return Ok((cur, max));
                    }
                    Err(e) => last_err = e,
                }
            }
        }
        Err(last_err)
    }

    fn set_tpv_vcp(&self, b1: u8, b2: u8, b3: u8, value: u32) -> Result<(), String> {
        let hi = ((value >> 8) & 0xFF) as u8;
        let lo = (value & 0xFF) as u8;
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(100));
            }
            match unsafe { self.raw_write(&[0x03, b1, b2, b3, hi, lo], 190) } {
                Ok(()) => return Ok(()),
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }
}

// ============================================================================
// AMD ADLX (amdadlx64.dll) — Controle Nativo de AMD FreeSync / Adaptive-Sync
// ============================================================================
struct AdlxFns {
    fn_query_full_ver: unsafe extern "C" fn(*mut u64) -> i32,
    fn_init: unsafe extern "C" fn(u64, *mut *mut c_void) -> i32,
    fn_terminate: unsafe extern "C" fn() -> i32,
}

unsafe impl Send for AdlxFns {}
unsafe impl Sync for AdlxFns {}

static ADLX_LIB: OnceLock<Option<AdlxFns>> = OnceLock::new();

fn get_adlx() -> Option<&'static AdlxFns> {
    ADLX_LIB
        .get_or_init(|| unsafe {
            let h = LoadLibraryW(wide_null("amdadlx64.dll").as_ptr());
            if h.is_null() {
                return None;
            }
            let p_ver = GetProcAddress(h, b"ADLXQueryFullVersion\0".as_ptr());
            let p_init = GetProcAddress(h, b"ADLXInitialize\0".as_ptr());
            let p_term = GetProcAddress(h, b"ADLXTerminate\0".as_ptr());
            if p_ver.is_null() || p_init.is_null() || p_term.is_null() {
                return None;
            }
            Some(AdlxFns {
                fn_query_full_ver: std::mem::transmute(p_ver),
                fn_init: std::mem::transmute(p_init),
                fn_terminate: std::mem::transmute(p_term),
            })
        })
        .as_ref()
}

unsafe fn vtbl_entry(obj: *mut c_void, idx: usize) -> *const c_void {
    unsafe {
        let vtbl = *(obj as *const *const *const c_void);
        *vtbl.add(idx)
    }
}

unsafe fn adlx_release(obj: *mut c_void) {
    if !obj.is_null() {
        unsafe {
            let f: unsafe extern "system" fn(*mut c_void) -> i32 =
                std::mem::transmute(vtbl_entry(obj, 1));
            let _ = f(obj);
        }
    }
}

/// Executa uma operação sobre `IADLXDisplayFreeSync` do monitor AOC alvo.
fn with_adlx_freesync<F, R>(op: F) -> Result<R, String>
where
    F: FnOnce(*mut c_void) -> Result<R, String>,
{
    let adlx = get_adlx().ok_or_else(|| "Driver AMD ADLX (amdadlx64.dll) não encontrado".to_string())?;
    unsafe {
        let mut sys_ptr: *mut c_void = null_mut();
        let ver_1_0: u64 = 1u64 << 48;
        let mut rc = (adlx.fn_init)(ver_1_0, &mut sys_ptr);
        if rc != 0 || sys_ptr.is_null() {
            let mut full_ver: u64 = 0;
            let _ = (adlx.fn_query_full_ver)(&mut full_ver);
            rc = (adlx.fn_init)(full_ver, &mut sys_ptr);
        }
        if rc != 0 || sys_ptr.is_null() {
            return Err(format!("ADLXInitialize falhou (rc={})", rc));
        }

        let result = (|| {
            // IADLXSystemVtbl[3] = GetDisplaysServices
            let mut disp_srv: *mut c_void = null_mut();
            let get_disp_srv: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32 =
                std::mem::transmute(vtbl_entry(sys_ptr, 3));
            if get_disp_srv(sys_ptr, &mut disp_srv) != 0 || disp_srv.is_null() {
                return Err("Falha em GetDisplaysServices".to_string());
            }

            // IADLXDisplayServicesVtbl[4] = GetDisplays
            let mut disp_list: *mut c_void = null_mut();
            let get_displays: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32 =
                std::mem::transmute(vtbl_entry(disp_srv, 4));
            if get_displays(disp_srv, &mut disp_list) != 0 || disp_list.is_null() {
                adlx_release(disp_srv);
                return Err("Falha em GetDisplays".to_string());
            }

            // IADLXDisplayListVtbl[3] = Size, [11] = At_DisplayList
            let list_size: unsafe extern "system" fn(*mut c_void) -> u32 =
                std::mem::transmute(vtbl_entry(disp_list, 3));
            let list_at: unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> i32 =
                std::mem::transmute(vtbl_entry(disp_list, 11));
            let count = list_size(disp_list);

            let mut chosen_disp: *mut c_void = null_mut();
            for i in 0..count {
                let mut disp: *mut c_void = null_mut();
                if list_at(disp_list, i, &mut disp) == 0 && !disp.is_null() {
                    // IADLXDisplayVtbl[6] = Name
                    let get_name: unsafe extern "system" fn(*mut c_void, *mut *const c_char) -> i32 =
                        std::mem::transmute(vtbl_entry(disp, 6));
                    let mut cname: *const c_char = null();
                    let name_str = if get_name(disp, &mut cname) == 0 && !cname.is_null() {
                        CStr::from_ptr(cname).to_string_lossy().into_owned()
                    } else {
                        String::new()
                    };

                    if is_aoc_target_name(&name_str) {
                        if !chosen_disp.is_null() {
                            adlx_release(chosen_disp);
                        }
                        chosen_disp = disp;
                        break;
                    } else if chosen_disp.is_null() {
                        chosen_disp = disp;
                    } else {
                        adlx_release(disp);
                    }
                }
            }

            if chosen_disp.is_null() {
                adlx_release(disp_list);
                adlx_release(disp_srv);
                return Err("Nenhum monitor encontrado no ADLX".to_string());
            }

            // IADLXDisplayServicesVtbl[9] = GetFreeSync
            let get_freesync: unsafe extern "system" fn(
                *mut c_void,
                *mut c_void,
                *mut *mut c_void,
            ) -> i32 = std::mem::transmute(vtbl_entry(disp_srv, 9));
            let mut fs_ptr: *mut c_void = null_mut();
            let rc_fs = get_freesync(disp_srv, chosen_disp, &mut fs_ptr);

            let res = if rc_fs == 0 && !fs_ptr.is_null() {
                let r = op(fs_ptr);
                adlx_release(fs_ptr);
                r
            } else {
                Err(format!("GetFreeSync falhou (rc={})", rc_fs))
            };

            adlx_release(chosen_disp);
            adlx_release(disp_list);
            adlx_release(disp_srv);
            res
        })();

        let _ = (adlx.fn_terminate)();
        result
    }
}

// ============================================================================
// Helpers de HDR do Windows (DisplayConfig)
// ============================================================================
fn find_aoc_displayconfig_target() -> Result<(Luid, u32, String), String> {
    unsafe {
        let mut num_paths: u32 = 0;
        let mut num_modes: u32 = 0;
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut num_paths, &mut num_modes) != 0
            || num_paths == 0
        {
            return Err("Falha em GetDisplayConfigBufferSizes".to_string());
        }

        let mut paths = vec![DisplayConfigPathInfo::default(); num_paths as usize];
        let mut modes = vec![DisplayConfigModeInfo::default(); num_modes as usize];
        if QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut num_paths,
            paths.as_mut_ptr(),
            &mut num_modes,
            modes.as_mut_ptr(),
            null_mut(),
        ) != 0
        {
            return Err("Falha em QueryDisplayConfig".to_string());
        }

        let mut fallback: Option<(Luid, u32, String)> = None;
        for p in &paths[..num_paths as usize] {
            let mut tn: DisplayConfigTargetDeviceName = std::mem::zeroed();
            tn.header.info_type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
            tn.header.size = std::mem::size_of::<DisplayConfigTargetDeviceName>() as u32;
            tn.header.adapter_id = p.target_info.adapter_id;
            tn.header.id = p.target_info.id;

            let name = if DisplayConfigGetDeviceInfo(&mut tn.header) == 0 {
                let friendly = u16_buf_to_string(&tn.monitor_friendly_device_name);
                let path = u16_buf_to_string(&tn.monitor_device_path);
                if is_aoc_target_name(&friendly) || is_aoc_target_name(&path) {
                    return Ok((p.target_info.adapter_id, p.target_info.id, friendly));
                }
                friendly
            } else {
                String::new()
            };

            if fallback.is_none() {
                fallback = Some((p.target_info.adapter_id, p.target_info.id, name));
            }
        }

        fallback.ok_or_else(|| "Nenhum monitor ativo encontrado no Windows".to_string())
    }
}

// ============================================================================
// DXVA2 Helper (Fallback)
// ============================================================================
unsafe extern "system" fn monitor_enum_proc(
    h_monitor: HMONITOR,
    _hdc: HDC,
    _lprect: LPRECT,
    data: LPARAM,
) -> BOOL {
    unsafe {
        let monitors = &mut *(data as *mut Vec<HMONITOR>);
        monitors.push(h_monitor);
    }
    1
}

fn with_dxva2_monitor<F, R>(op: F) -> Result<R, String>
where
    F: FnOnce(&Dxva2Api, HANDLE) -> Result<R, String>,
{
    let api = get_dxva2().ok_or_else(|| "dxva2.dll não disponível".to_string())?;
    unsafe {
        let mut hmonitors: Vec<HMONITOR> = Vec::new();
        EnumDisplayMonitors(
            null_mut(),
            null_mut(),
            monitor_enum_proc,
            &mut hmonitors as *mut Vec<HMONITOR> as LPARAM,
        );
        if hmonitors.is_empty() {
            return Err("Nenhum monitor encontrado no Windows".to_string());
        }

        let mut all_groups: Vec<Vec<PhysicalMonitor>> = Vec::new();
        let mut target_idx: Option<(usize, usize)> = None;

        for (gi, &hm) in hmonitors.iter().enumerate() {
            let mut count: DWORD = 0;
            if (api.get_num_monitors)(hm, &mut count) == 0 || count == 0 {
                continue;
            }
            let mut arr: Vec<PhysicalMonitor> = Vec::with_capacity(count as usize);
            arr.set_len(count as usize);
            if (api.get_physical_monitors)(hm, count, arr.as_mut_ptr()) == 0 {
                continue;
            }
            for (pi, pm) in arr.iter().enumerate() {
                let desc = u16_buf_to_string(&pm.sz_physical_monitor_description);
                if is_aoc_target_name(&desc) {
                    target_idx = Some((all_groups.len(), pi));
                }
            }
            let _ = gi;
            all_groups.push(arr);
        }

        if all_groups.is_empty() {
            return Err("Nenhum monitor físico acessível via DXVA2".to_string());
        }

        let (g_idx, p_idx) = target_idx.unwrap_or((0, 0));
        let handle = all_groups[g_idx][p_idx].h_physical_monitor;
        let res = op(api, handle);

        for mut grp in all_groups {
            let _ = (api.destroy_physical_monitors)(grp.len() as DWORD, grp.as_mut_ptr());
        }
        res
    }
}

// ============================================================================
// Gerenciador Unificado Windows
// ============================================================================
pub struct WindowsDdcManager {
    adl: Option<AdlBackend>,
}

unsafe impl Send for WindowsDdcManager {}
unsafe impl Sync for WindowsDdcManager {}

impl WindowsDdcManager {
    pub fn new() -> Result<Self, String> {
        let adl = unsafe { AdlBackend::load().ok() };
        Ok(Self { adl })
    }

    fn ensure_adl(&mut self) -> Option<&AdlBackend> {
        if self.adl.is_none() {
            self.adl = unsafe { AdlBackend::load().ok() };
        }
        self.adl.as_ref()
    }

    pub fn get_monitor_info(&mut self) -> MonitorInfo {
        let ddc_ok = self.ensure_adl().is_some();
        let raw_name = self
            .adl
            .as_ref()
            .map(|a| a.display_name.clone())
            .unwrap_or_default();
        let name = if raw_name.is_empty() || raw_name.starts_with("24G2") {
            "AOC 24G2S".to_string()
        } else {
            raw_name
        };

        let (hdr_sup, hdr_ena) = self.get_hdr_status();
        let (fs_sup, fs_ena) = self.get_adaptive_sync_status();

        MonitorInfo {
            name,
            connection: "DisplayPort".to_string(),
            ddc_supported: ddc_ok,
            hdr_supported: hdr_sup,
            hdr_enabled: hdr_ena,
            adaptive_sync_supported: fs_sup,
            adaptive_sync_enabled: fs_ena,
        }
    }

    pub fn get_vcp(&mut self, code: u8) -> Result<(u32, u32), String> {
        if let Some(adl) = self.ensure_adl() {
            return adl.get_std_vcp(code);
        }
        with_dxva2_monitor(|api, h| unsafe {
            let mut pvct: DWORD = 0;
            let mut cur: DWORD = 0;
            let mut max: DWORD = 0;
            let ok = (api.get_vcp)(h, code, &mut pvct, &mut cur, &mut max);
            sleep(Duration::from_millis(55));
            if ok != 0 {
                Ok((cur, max))
            } else {
                Err(format!("DXVA2 GetVCP 0x{:02X} falhou", code))
            }
        })
    }

    pub fn set_vcp(&mut self, code: u8, value: u32) -> Result<(), String> {
        if let Some(adl) = self.ensure_adl() {
            return adl.set_std_vcp(code, value);
        }
        with_dxva2_monitor(|api, h| unsafe {
            let ok = (api.set_vcp)(h, code, value);
            sleep(Duration::from_millis(120));
            if ok != 0 {
                Ok(())
            } else {
                Err(format!("DXVA2 SetVCP 0x{:02X}={} falhou", code, value))
            }
        })
    }

    pub fn get_tpv_vcp(&mut self, b1: u8, b2: u8, b3: u8) -> Result<(u32, u32), String> {
        if let Some(adl) = self.ensure_adl() {
            adl.get_tpv_vcp(b1, b2, b3)
        } else {
            Err("TPV Extended DDC/CI requer acesso I2C direto da GPU (ADL)".to_string())
        }
    }

    pub fn set_tpv_vcp(&mut self, b1: u8, b2: u8, b3: u8, value: u32) -> Result<(), String> {
        if let Some(adl) = self.ensure_adl() {
            adl.set_tpv_vcp(b1, b2, b3, value)
        } else {
            Err("TPV Extended DDC/CI requer acesso I2C direto da GPU (ADL)".to_string())
        }
    }

    pub fn get_hdr_status(&self) -> (bool, bool) {
        if let Ok((adapter_id, target_id, _)) = find_aoc_displayconfig_target() {
            unsafe {
                let mut aci = DisplayConfigGetAdvancedColorInfo::default();
                aci.header.info_type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
                aci.header.size = std::mem::size_of::<DisplayConfigGetAdvancedColorInfo>() as u32;
                aci.header.adapter_id = adapter_id;
                aci.header.id = target_id;
                if DisplayConfigGetDeviceInfo(&mut aci.header) == 0 {
                    let supported = (aci.value & 1) != 0;
                    let enabled = (aci.value & 2) != 0;
                    return (supported, enabled);
                }
            }
        }
        (false, false)
    }

    pub fn set_hdr(&mut self, enabled: bool) -> Result<(), String> {
        let (adapter_id, target_id, _) = find_aoc_displayconfig_target()?;
        unsafe {
            let mut aci = DisplayConfigGetAdvancedColorInfo::default();
            aci.header.info_type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
            aci.header.size = std::mem::size_of::<DisplayConfigGetAdvancedColorInfo>() as u32;
            aci.header.adapter_id = adapter_id;
            aci.header.id = target_id;
            if DisplayConfigGetDeviceInfo(&mut aci.header) == 0 {
                let supported = (aci.value & 1) != 0;
                let cur_enabled = (aci.value & 2) != 0;
                if !supported {
                    return Err("HDR não é suportado nesta saída de vídeo".to_string());
                }
                if cur_enabled == enabled {
                    return Ok(());
                }
            }

            let mut set_pkt = DisplayConfigSetAdvancedColorState::default();
            set_pkt.header.info_type = DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE;
            set_pkt.header.size = std::mem::size_of::<DisplayConfigSetAdvancedColorState>() as u32;
            set_pkt.header.adapter_id = adapter_id;
            set_pkt.header.id = target_id;
            set_pkt.value = if enabled { 1 } else { 0 };

            let rc = DisplayConfigSetDeviceInfo(&mut set_pkt.header);
            if rc == 0 {
                Ok(())
            } else {
                Err(format!("Falha ao alternar HDR no Windows (rc={})", rc))
            }
        }
    }

pub fn get_windows_vrr_enabled() -> bool {
    let subkey: Vec<u16> = "Software\\Microsoft\\DirectX\\UserGpuPreferences\0"
        .encode_utf16()
        .collect();
    let valname: Vec<u16> = "DirectXUserGlobalSettings\0".encode_utf16().collect();
    let mut hkey: HKEY = null_mut();

    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey)
            != ERROR_SUCCESS
        {
            return false;
        }

        let mut val_type: DWORD = 0;
        let mut byte_len: DWORD = 0;
        if RegQueryValueExW(
            hkey,
            valname.as_ptr(),
            null_mut(),
            &mut val_type,
            null_mut(),
            &mut byte_len,
        ) != ERROR_SUCCESS
            || byte_len == 0
        {
            let _ = RegCloseKey(hkey);
            return false;
        }

        let mut buf = vec![0u8; byte_len as usize];
        let rc = RegQueryValueExW(
            hkey,
            valname.as_ptr(),
            null_mut(),
            &mut val_type,
            buf.as_mut_ptr(),
            &mut byte_len,
        );
        let _ = RegCloseKey(hkey);

        if rc != ERROR_SUCCESS || val_type != REG_SZ {
            return false;
        }

        let u16_slice = std::slice::from_raw_parts(buf.as_ptr() as *const u16, buf.len() / 2);
        let s = String::from_utf16_lossy(u16_slice);
        s.contains("VRROptimizeEnable=1")
    }
}

pub fn set_windows_vrr_enabled(enable: bool) -> Result<(), String> {
    let subkey: Vec<u16> = "Software\\Microsoft\\DirectX\\UserGpuPreferences\0"
        .encode_utf16()
        .collect();
    let valname: Vec<u16> = "DirectXUserGlobalSettings\0".encode_utf16().collect();
    let mut hkey: HKEY = null_mut();
    let mut disposition: DWORD = 0;

    unsafe {
        let rc = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            null_mut(),
            0,
            KEY_READ | KEY_WRITE,
            null_mut(),
            &mut hkey,
            &mut disposition,
        );
        if rc != ERROR_SUCCESS {
            return Err(format!("Falha ao abrir chave de registro DirectX (rc={})", rc));
        }

        let mut current_str = String::new();
        let mut val_type: DWORD = 0;
        let mut byte_len: DWORD = 0;
        if RegQueryValueExW(
            hkey,
            valname.as_ptr(),
            null_mut(),
            &mut val_type,
            null_mut(),
            &mut byte_len,
        ) == ERROR_SUCCESS
            && byte_len > 0
        {
            let mut buf = vec![0u8; byte_len as usize];
            if RegQueryValueExW(
                hkey,
                valname.as_ptr(),
                null_mut(),
                &mut val_type,
                buf.as_mut_ptr(),
                &mut byte_len,
            ) == ERROR_SUCCESS
                && val_type == REG_SZ
            {
                let u16_slice = std::slice::from_raw_parts(buf.as_ptr() as *const u16, buf.len() / 2);
                current_str = String::from_utf16_lossy(u16_slice)
                    .trim_matches('\0')
                    .to_string();
            }
        }

        let new_str = if enable {
            if current_str.contains("VRROptimizeEnable=0") {
                current_str.replace("VRROptimizeEnable=0", "VRROptimizeEnable=1")
            } else if !current_str.contains("VRROptimizeEnable=1") {
                if current_str.is_empty() || current_str.ends_with(';') {
                    format!("{}VRROptimizeEnable=1;", current_str)
                } else {
                    format!("{};VRROptimizeEnable=1;", current_str)
                }
            } else {
                current_str
            }
        } else {
            if current_str.contains("VRROptimizeEnable=1") {
                current_str.replace("VRROptimizeEnable=1", "VRROptimizeEnable=0")
            } else {
                current_str
            }
        };

        let mut encoded: Vec<u16> = new_str.encode_utf16().collect();
        encoded.push(0);

        let write_rc = RegSetValueExW(
            hkey,
            valname.as_ptr(),
            0,
            REG_SZ,
            encoded.as_ptr() as *const u8,
            (encoded.len() * 2) as DWORD,
        );
        let _ = RegCloseKey(hkey);

        if write_rc == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(format!("Falha ao gravar VRROptimizeEnable no registro (rc={})", write_rc))
        }
    }
}

    pub fn get_adaptive_sync_status(&self) -> (bool, bool) {
        let (_fs_sup, fs_ena) = with_adlx_freesync(|fs_ptr| unsafe {
            let is_sup_fn: unsafe extern "system" fn(*mut c_void, *mut u8) -> i32 =
                std::mem::transmute(vtbl_entry(fs_ptr, 3));
            let is_ena_fn: unsafe extern "system" fn(*mut c_void, *mut u8) -> i32 =
                std::mem::transmute(vtbl_entry(fs_ptr, 4));
            let mut sup: u8 = 0;
            let mut ena: u8 = 0;
            let _ = is_sup_fn(fs_ptr, &mut sup);
            let _ = is_ena_fn(fs_ptr, &mut ena);
            Ok((sup != 0, ena != 0))
        })
        .unwrap_or((false, false));

        let vrr_ena = Self::get_windows_vrr_enabled();
        // O AOC 24G2 / 24G2W1G3 possui suporte nativo a Adaptive-Sync / VRR (48 Hz - 165 Hz)
        (true, fs_ena || vrr_ena)
    }

    pub fn set_adaptive_sync(&mut self, enabled: bool) -> Result<(), String> {
        // 1. Caso seja um modelo AOC geração E2 A0 com suporte DDC direto
        if let Some(adl) = self.ensure_adl() {
            if adl
                .get_tpv_vcp(vcp::TPV_E2, vcp::TPV_A0, vcp::EXT_E2A0_ADAPTIVE_SYNC)
                .is_ok()
            {
                let _ = adl.set_tpv_vcp(
                    vcp::TPV_E2,
                    vcp::TPV_A0,
                    vcp::EXT_E2A0_ADAPTIVE_SYNC,
                    if enabled { 1 } else { 0 },
                );
            }
        }

        // 2. Ativa/desativa no Registro do Windows (Variable Refresh Rate)
        let _ = Self::set_windows_vrr_enabled(enabled);

        // 3. Ativa/desativa no driver AMD Radeon FreeSync via ADLX
        let _ = with_adlx_freesync(|fs_ptr| unsafe {
            let is_sup_fn: unsafe extern "system" fn(*mut c_void, *mut u8) -> i32 =
                std::mem::transmute(vtbl_entry(fs_ptr, 3));
            let is_ena_fn: unsafe extern "system" fn(*mut c_void, *mut u8) -> i32 =
                std::mem::transmute(vtbl_entry(fs_ptr, 4));
            let set_ena_fn: unsafe extern "system" fn(*mut c_void, u8) -> i32 =
                std::mem::transmute(vtbl_entry(fs_ptr, 5));

            let mut sup: u8 = 0;
            let _ = is_sup_fn(fs_ptr, &mut sup);
            if sup == 0 {
                // Windows VRR já foi configurado acima
                return Ok(());
            }

            let mut cur_ena: u8 = 0;
            let _ = is_ena_fn(fs_ptr, &mut cur_ena);
            if (cur_ena != 0) == enabled {
                return Ok(());
            }

            let rc = set_ena_fn(fs_ptr, if enabled { 1 } else { 0 });
            if rc == 0 {
                Ok(())
            } else {
                Err(format!("ADLX SetEnabled(FreeSync) falhou (rc={})", rc))
            }
        });

        Ok(())
    }
}
