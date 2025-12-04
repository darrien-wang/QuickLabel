import React, { useState } from 'react';
import { X } from 'lucide-react';
import { LabelFieldMapping } from '../types';

interface FieldMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableColumns: string[];
    currentMapping: LabelFieldMapping | null;
    onSave: (mapping: LabelFieldMapping) => void;
}

export const FieldMappingModal: React.FC<FieldMappingModalProps> = ({
    isOpen,
    onClose,
    availableColumns,
    currentMapping,
    onSave
}) => {
    const [mapping, setMapping] = useState<LabelFieldMapping>(
        currentMapping || {
            stopNumber: '',
            recipientName: '',
            address: '',
            phone: '',
            position: ''
        }
    );

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(mapping);
        onClose();
    };

    const fieldLabels = {
        stopNumber: 'Stop Number (Top Right)',
        recipientName: 'Recipient Name',
        address: 'Address',
        phone: 'Phone / Contact',
        position: 'Position / Stop Info'
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Configure Label Fields</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <p className="text-gray-600 mb-4">
                    Select which columns from your data should appear in each position on the label.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-800 font-medium mb-2">💡 Available Columns:</p>
                    <div className="flex flex-wrap gap-2">
                        {availableColumns.length > 0 ? (
                            availableColumns.map(col => (
                                <span key={col} className="bg-white px-2 py-1 rounded text-xs font-mono border border-blue-200">
                                    {col}
                                </span>
                            ))
                        ) : (
                            <span className="text-sm text-blue-600 italic">No data loaded yet</span>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    {Object.entries(fieldLabels).map(([key, label]) => (
                        <div key={key}>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                {label}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={mapping[key as keyof LabelFieldMapping]}
                                    onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                                    placeholder="Enter column name or cell reference (e.g., 'Order ID' or 'B')"
                                    className="flex-1 px-4 py-3 text-base bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-0 transition-colors font-mono"
                                    list={`${key}-datalist`}
                                />
                                <datalist id={`${key}-datalist`}>
                                    {availableColumns.map(col => (
                                        <option key={col} value={col} />
                                    ))}
                                </datalist>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                    >
                        Save Mapping
                    </button>
                </div>
            </div>
        </div>
    );
};
