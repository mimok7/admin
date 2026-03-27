'use client';

import React, { useState, useEffect } from 'react';
import {
    Plus, Edit, Trash2, Package, Ship, Hotel, Car, MapPin,
    ChevronRight, Loader2, X, AlertCircle, CheckCircle2
} from 'lucide-react';
import supabase from '@/lib/supabase';
import { PackageWithItems, PackageMaster, PackageItem } from '@/lib/types';
import AdminLayout from '@/components/AdminLayout';

export default function AdminPackagesPage() {
    const [packages, setPackages] = useState<PackageWithItems[]>([]);
    const [loading, setLoading] = useState(true);
    const [opened, setOpened] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // 폼 상태
    const [formData, setFormData] = useState<Partial<PackageMaster>>({
        name: '',
        package_code: '',
        base_price: 0,
        description: '',
        is_active: true,
        price_config: {},
        price_child_extra_bed: 0,
        price_child_no_extra_bed: 0,
        price_infant_tour: 0,
        price_infant_extra_bed: 0,
        price_infant_seat: 0,
        vehicle_config: {}
    });
    const [formItems, setFormItems] = useState<Partial<PackageItem>[]>([]);
    const [availableCruises, setAvailableCruises] = useState<string[]>([]);
    const [availableRooms, setAvailableRooms] = useState<any[]>([]);
    const [availableTours, setAvailableTours] = useState<any[]>([]);

    useEffect(() => {
        fetchPackages();
        loadServiceData();
    }, []);

    const loadServiceData = async () => {
        try {
            const [roomRes, tourRes] = await Promise.all([
                supabase.from('cruise_rate_card').select('cruise_name, room_type, id').eq('is_active', true),
                supabase.from('tour').select('tour_name, tour_code, category, tour_id').eq('is_active', true)
            ]);

            if (roomRes.data) {
                const cruises = Array.from(new Set(roomRes.data.map((r: any) => r.cruise_name).filter(Boolean)));
                setAvailableCruises(cruises as string[]);
                setAvailableRooms(roomRes.data);
            }

            if (tourRes.data) {
                setAvailableTours(tourRes.data);
            }
        } catch (e) {
            console.error('Error loading service data:', e);
        }
    };

    const fetchPackages = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('package_master')
                .select(`
          *,
          items:package_items(*)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPackages(data || []);
        } catch (error) {
            console.error('Error fetching packages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setFormData({
            name: '',
            package_code: '',
            base_price: 0,
            description: '',
            is_active: true,
            price_config: {},
            price_child_extra_bed: 0,
            price_child_no_extra_bed: 0,
            price_infant_tour: 0,
            price_infant_extra_bed: 0,
            price_infant_seat: 0,
            vehicle_config: {}
        });
        setFormItems([]);
        setOpened(true);
    };

    const handleEdit = (pkg: PackageWithItems) => {
        setFormData({
            id: pkg.id,
            name: pkg.name,
            package_code: pkg.package_code,
            base_price: pkg.base_price,
            description: pkg.description,
            is_active: pkg.is_active,
            price_config: pkg.price_config || {},
            price_child_extra_bed: pkg.price_child_extra_bed || 0,
            price_child_no_extra_bed: pkg.price_child_no_extra_bed || 0,
            price_infant_tour: pkg.price_infant_tour || 0,
            price_infant_extra_bed: pkg.price_infant_extra_bed || 0,
            price_infant_seat: pkg.price_infant_seat || 0,
            vehicle_config: pkg.vehicle_config || {}
        });
        setFormItems(pkg.items || []);
        setOpened(true);
    };

    const addItem = () => {
        setFormItems([...formItems, { service_type: 'cruise', item_order: formItems.length + 1 }]);
    };

    const removeItem = (index: number) => {
        setFormItems(formItems.filter((_, i) => i !== index));
    };

    const updateItemType = (index: number, type: any) => {
        const newItems = [...formItems];
        newItems[index] = { ...newItems[index], service_type: type, default_data: {} };
        setFormItems(newItems);
    };

    const updateItemValue = (index: number, field: keyof PackageItem, value: any) => {
        const newItems = [...formItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setFormItems(newItems);
    };

    const updateItemData = (index: number, field: string, value: any) => {
        const newItems = [...formItems];
        const defaultData = { ...(newItems[index].default_data || {}) };
        defaultData[field] = value;
        newItems[index] = { ...newItems[index], default_data: defaultData };
        setFormItems(newItems);
    };

    const updatePriceConfig = (pax: number, field: 'per_person' | 'total', value: number) => {
        const newConfig = { ...(formData.price_config || {}) };
        if (!newConfig[pax]) newConfig[pax] = { per_person: 0, total: 0 };

        if (field === 'per_person') {
            newConfig[pax].per_person = value;
            newConfig[pax].total = value * pax;
        } else {
            newConfig[pax].total = value;
            newConfig[pax].per_person = Math.floor(value / pax);
        }

        setFormData({ ...formData, price_config: newConfig });
    };

    const handleSave = async () => {
        if (!formData.package_code || !formData.name) {
            alert('필수 정보를 입력해주세요.');
            return;
        }

        setSubmitting(true);
        try {
            let packageId = formData.id;

            // 1. 패키지 마스터 저장/수정
            if (packageId) {
                const { error: masterError } = await supabase
                    .from('package_master')
                    .update({
                        package_code: formData.package_code,
                        name: formData.name,
                        base_price: formData.base_price,
                        description: formData.description,
                        price_config: formData.price_config,
                        price_child_extra_bed: formData.price_child_extra_bed,
                        price_child_no_extra_bed: formData.price_child_no_extra_bed,
                        price_infant_tour: formData.price_infant_tour,
                        price_infant_extra_bed: formData.price_infant_extra_bed,
                        price_infant_seat: formData.price_infant_seat,
                        vehicle_config: formData.vehicle_config,
                        is_active: formData.is_active,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', packageId);
                if (masterError) throw masterError;
                console.log('Master updated:', packageId);
            } else {
                const { data, error: masterError } = await supabase
                    .from('package_master')
                    .insert([{
                        package_code: formData.package_code,
                        name: formData.name,
                        base_price: formData.base_price,
                        description: formData.description,
                        price_config: formData.price_config,
                        price_child_extra_bed: formData.price_child_extra_bed,
                        price_child_no_extra_bed: formData.price_child_no_extra_bed,
                        price_infant_tour: formData.price_infant_tour,
                        price_infant_extra_bed: formData.price_infant_extra_bed,
                        price_infant_seat: formData.price_infant_seat,
                        vehicle_config: formData.vehicle_config,
                        is_active: formData.is_active
                    }])
                    .select();
                if (masterError) throw masterError;
                if (!data || data.length === 0) throw new Error('데이터 저장 실패');
                packageId = data[0].id;
                console.log('Master created:', packageId);
            }

            // 2. 구성 아이템 갱신
            if (packageId) {
                // DELETE 기존 아이템
                const { error: deleteError } = await supabase
                    .from('package_items')
                    .delete()
                    .eq('package_id', packageId);

                if (deleteError) {
                    console.error('Delete items error:', deleteError);
                    throw new Error('기존 구성을 수정하는 중 오류가 발생했습니다: ' + deleteError.message);
                }

                if (formItems.length > 0) {
                    const itemsToInsert = formItems.map((item, idx) => ({
                        package_id: packageId,
                        service_type: item.service_type,
                        item_order: idx + 1,
                        description: item.description || '',
                        default_data: item.default_data || {}
                    }));

                    const { error: itemsError } = await supabase.from('package_items').insert(itemsToInsert);
                    if (itemsError) throw itemsError;
                    console.log('Items updated:', itemsToInsert.length);
                }
            }

            await fetchPackages();
            setOpened(false);
            setFormData({
                name: '',
                package_code: '',
                base_price: 0,
                description: '',
                is_active: true,
                price_config: {},
                price_child_extra_bed: 0,
                price_child_no_extra_bed: 0,
                price_infant_tour: 0,
                price_infant_extra_bed: 0,
                price_infant_seat: 0,
                vehicle_config: {}
            });
            setFormItems([]);
            alert('저장되었습니다.');
        } catch (error: any) {
            console.error('Save error details:', error);
            alert('저장 중 오류: ' + (error.message || '알 수 없는 오류'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까? 관련 구성 정보도 모두 삭제됩니다.')) return;

        try {
            const { error } = await supabase.from('package_master').delete().eq('id', id);
            if (error) throw error;
            fetchPackages();
        } catch (error: any) {
            alert('삭제 실패: ' + error.message);
        }
    };

    return (
        <AdminLayout title="📦 패키지 상품 관리" activeTab="packages">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">패키지 상품 관리</h2>
                        <p className="text-gray-500 text-sm">하이브리드 패키지 상품을 정의하고 관리합니다.</p>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
                    >
                        <Plus size={20} /> 새 패키지 등록
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                            <Loader2 className="animate-spin text-blue-600" size={32} />
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    <th className="px-6 py-4">패키지 코드</th>
                                    <th className="px-6 py-4">패키지 명</th>
                                    <th className="px-6 py-4">기본 판매가</th>
                                    <th className="px-6 py-4">구성 항목</th>
                                    <th className="px-6 py-4">상태</th>
                                    <th className="px-6 py-4 text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {packages.map((pkg) => (
                                    <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-sm text-blue-600 font-bold">{pkg.package_code}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{pkg.name}</td>
                                        <td className="px-6 py-4 text-sm font-semibold">{pkg.base_price?.toLocaleString()} KRW</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {pkg.items?.map((item, idx) => (
                                                    <span key={idx} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 uppercase">
                                                        {item.service_type}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {pkg.is_active ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    판매중
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    중단
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(pkg)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(pkg.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {packages.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-20 text-center text-gray-400">
                                            <div className="flex flex-col items-center">
                                                <AlertCircle size={48} className="mb-2 opacity-20" />
                                                <p>등록된 패키지가 없습니다.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 모달 */}
            {opened && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-900">{formData.id ? '패키지 수정' : '새 패키지 등록'}</h3>
                                <button onClick={() => setOpened(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>

                            <div className="bg-white px-6 py-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div className="grid gap-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">패키지 코드</label>
                                    <input
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="PKG-XXXX"
                                        value={formData.package_code || ''}
                                        onChange={e => setFormData({ ...formData, package_code: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">패키지 명</label>
                                    <input
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="하롱베이 프리미엄 패키지"
                                        value={formData.name || ''}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">기본 판매가 (KRW)</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.base_price || ''}
                                        onChange={e => setFormData({ ...formData, base_price: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">설명</label>
                                    <textarea
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[60px]"
                                        placeholder="상세 정보를 입력하세요"
                                        value={formData.description || ''}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                {/* 연령별 추가 요금 섹션 */}
                                <div className="pt-4 border-t border-gray-100">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-3">연령별 추가 요금 (VND)</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="grid gap-1">
                                            <label className="text-xs text-gray-500">아동 엑스트라베드</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                                                value={formData.price_child_extra_bed || ''}
                                                onChange={e => setFormData({ ...formData, price_child_extra_bed: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-xs text-gray-500">아동 엑스트라베드 미사용</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                                                value={formData.price_child_no_extra_bed || ''}
                                                onChange={e => setFormData({ ...formData, price_child_no_extra_bed: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-xs text-gray-500">유아 투어 추가</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                                                value={formData.price_infant_tour || ''}
                                                onChange={e => setFormData({ ...formData, price_infant_tour: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-xs text-gray-500">유아 엑스트라베드</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                                                value={formData.price_infant_extra_bed || ''}
                                                onChange={e => setFormData({ ...formData, price_infant_extra_bed: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="grid gap-1 col-span-2">
                                            <label className="text-xs text-gray-500">유아 시트 추가</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                                                value={formData.price_infant_seat || ''}
                                                onChange={e => setFormData({ ...formData, price_infant_seat: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">인원별 가격 설정 (VND)</label>
                                    <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-100 text-gray-400">
                                                    <th className="px-2 py-2 text-left">인원</th>
                                                    <th className="px-2 py-2 text-left">1인당 요금</th>
                                                    <th className="px-2 py-2 text-left">총 합계</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(pax => (
                                                    <tr key={pax}>
                                                        <td className="px-2 py-1 font-bold text-gray-600">{pax}인</td>
                                                        <td className="px-2 py-1">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-gray-200 rounded px-1 py-0.5"
                                                                value={formData.price_config?.[pax]?.per_person || ''}
                                                                onChange={e => updatePriceConfig(pax, 'per_person', Number(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-gray-200 rounded px-1 py-0.5"
                                                                value={formData.price_config?.[pax]?.total || ''}
                                                                onChange={e => updatePriceConfig(pax, 'total', Number(e.target.value))}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* 차량 구성 섹션 */}
                                <div className="pt-4 border-t border-gray-100">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-3">차량 구성 설정</label>
                                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                                        <div className="grid grid-cols-3 gap-3 text-xs">
                                            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(pax => (
                                                <div key={pax} className="flex items-center gap-2">
                                                    <span className="text-gray-600 font-bold w-8">{pax}인:</span>
                                                    <input
                                                        type="text"
                                                        className="flex-1 bg-white border border-gray-200 rounded px-2 py-1"
                                                        placeholder="7인승"
                                                        value={(formData.vehicle_config as Record<string, string>)?.[String(pax)] || ''}
                                                        onChange={e => {
                                                            const newConfig = { ...(formData.vehicle_config || {}) } as Record<string, string>;
                                                            newConfig[String(pax)] = e.target.value;
                                                            setFormData({ ...formData, vehicle_config: newConfig });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">* 인원별 사용 차량을 입력하세요 (예: 7인승, 16인승, 7인승+16인승)</p>
                                    </div>
                                </div>

                                <div className="pt-4 space-y-4">
                                    <div className="flex justify-between items-center border-t border-gray-100 pt-4 text-sm font-bold text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-blue-600" /> 구성 서비스 템플릿
                                        </div>
                                        <button
                                            onClick={addItem}
                                            className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md"
                                        >
                                            + 항목 추가
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {formItems.map((item, idx) => (
                                            <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                                                <div className="flex gap-2 items-center">
                                                    <span className="text-xs font-bold text-gray-400 px-2">{idx + 1}</span>
                                                    <select
                                                        className="flex-1 bg-white border border-gray-200 rounded-lg py-1 px-2 text-sm outline-none"
                                                        value={item.service_type}
                                                        onChange={e => updateItemType(idx, e.target.value)}
                                                    >
                                                        <option value="cruise">크루즈</option>
                                                        <option value="hotel">호텔</option>
                                                        <option value="airport">공항(픽업/샌딩)</option>
                                                        <option value="tour">데이 투어</option>
                                                        <option value="rentcar">렌트카</option>
                                                        <option value="car_sht">스하 차량</option>
                                                    </select>
                                                    <button
                                                        onClick={() => removeItem(idx)}
                                                        className="text-red-400 hover:text-red-600 p-1"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>

                                                {/* 크루즈 상세 선택 */}
                                                {item.service_type === 'cruise' && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <select
                                                            className="bg-white border border-gray-200 rounded-lg py-1 px-2 text-xs outline-none"
                                                            value={item.default_data?.cruise_name || ''}
                                                            onChange={(e) => updateItemData(idx, 'cruise_name', e.target.value)}
                                                        >
                                                            <option value="">크루즈 선택</option>
                                                            {availableCruises.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                        <select
                                                            className="bg-white border border-gray-200 rounded-lg py-1 px-2 text-xs outline-none"
                                                            value={item.default_data?.room_code || ''}
                                                            onChange={(e) => updateItemData(idx, 'room_code', e.target.value)}
                                                            disabled={!item.default_data?.cruise_name}
                                                        >
                                                            <option value="">객실 선택</option>
                                                            {availableRooms
                                                                .filter(r => r.cruise === item.default_data?.cruise_name)
                                                                .map(r => (
                                                                    <option key={r.room_code} value={r.room_code}>
                                                                        {r.room_type} ({r.room_category})
                                                                    </option>
                                                                ))
                                                            }
                                                        </select>
                                                    </div>
                                                )}

                                                {/* 투어 상세 선택 */}
                                                {item.service_type === 'tour' && (
                                                    <select
                                                        className="w-full bg-white border border-gray-200 rounded-lg py-1 px-2 text-xs outline-none"
                                                        value={item.default_data?.tour_code || ''}
                                                        onChange={(e) => updateItemData(idx, 'tour_code', e.target.value)}
                                                    >
                                                        <option value="">투어 선택</option>
                                                        {availableTours.map(t => (
                                                            <option key={t.tour_code} value={t.tour_code}>
                                                                {t.tour_name} ({t.tour_type})
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}

                                                <div className="grid gap-1">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-white border border-gray-200 rounded-lg py-1 px-2 text-xs outline-none"
                                                        placeholder="서비스 상세 설명 (예: 앰배서더 시그니처 크루즈)"
                                                        value={item.description || ''}
                                                        onChange={e => updateItemValue(idx, 'description', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        {formItems.length === 0 && (
                                            <div className="text-center py-4 text-xs text-gray-400 italic">항목을 추가해주세요.</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                                <button
                                    onClick={() => setOpened(false)}
                                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100"
                                >취소</button>
                                <button
                                    disabled={submitting}
                                    onClick={handleSave}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 disabled:bg-gray-300"
                                > {submitting ? '저장 중...' : '저장하기'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
