import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import styles from './PromptsDetail.module.css';
import useProjectId from '../../hooks/useProjectId';
import {
  Book,
  Clipboard,
  Play,
  MoreVertical,
  Search,
  Plus,
  GitCommitHorizontal,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Tag,
} from 'lucide-react';
import DuplicatePromptModal from './DuplicatePromptModal.jsx';
import { duplicatePrompt } from './DuplicatePromptModalApi.js';
import { fetchPromptVersions } from './promptsApi.js'; // API 경로 수정
import NewExperimentModal from './NewExperimentModal';

export default function PromptsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projectId } = useProjectId();

  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState('Prompt');
  const [allPromptNames, setAllPromptNames] = useState([]);
  const [isDuplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [isPlaygroundMenuOpen, setPlaygroundMenuOpen] = useState(false);
  const playgroundMenuRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExperimentModalOpen, setExperimentModalOpen] = useState(false);

  // 검색 로직
  const filteredVersions = useMemo(() => {
    const searchId = parseInt(searchQuery, 10);
    if (!isNaN(searchId)) {
      return versions.filter(version => version.id === searchId);
    }
    if (!searchQuery) {
      return versions;
    }
    const query = searchQuery.toLowerCase();
    return versions.filter(version =>
      version.label.toLowerCase().includes(query) ||
      (version.author && version.author.toLowerCase().includes(query)) ||
      version.labels.some(label => label.toLowerCase().includes(query))
    );
  }, [versions, searchQuery]);

  // 데이터 로드
  const loadPromptData = useCallback(async () => {
    if (!id || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedVersions = await fetchPromptVersions(id, projectId);
      setVersions(fetchedVersions);
      if (fetchedVersions.length > 0) {
        setSelectedVersion(fetchedVersions[0]);
      } else {
        setError("해당 프롬프트의 버전을 찾을 수 없습니다.");
      }
    } catch (err) {
      console.error("Failed to fetch prompt details:", err);
      setError(`"${id}" 프롬프트를 불러오는 데 실패했습니다.`);
    } finally {
      setIsLoading(false);
    }
  }, [id, projectId]);

  useEffect(() => {
    loadPromptData();
  }, [loadPromptData]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (playgroundMenuRef.current && !playgroundMenuRef.current.contains(event.target)) {
        setPlaygroundMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNewVersion = () => {
    if (!id || !selectedVersion) return;
    const isChat = Array.isArray(selectedVersion.prompt);
    navigate(`/prompts/new`, {
      state: {
        projectId: projectId,
        promptName: id,
        promptType: isChat ? 'Chat' : 'Text',
        chatContent: isChat ? selectedVersion.prompt : [],
        textContent: isChat ? '' : selectedVersion.prompt,
        config: JSON.stringify(selectedVersion.config, null, 2),
        isNewVersion: true,
      },
    });
  };

  const handleGoToPlayground = () => {
    if (!selectedVersion) return;
    const isChat = Array.isArray(selectedVersion.prompt);
    const messages = isChat ? selectedVersion.prompt.map((p, i) => ({...p, id: Date.now() + i})) : [];

    navigate('/playground', {
      state: {
        promptName: id,
        promptVersion: selectedVersion.id,
        messages: messages,
        config: selectedVersion.config,
      }
    });
  };

  // 이전/다음 프롬프트 네비게이션
  const { currentPromptIndex, handlePrev, handleNext } = useMemo(() => {
    const currentIndex = id ? allPromptNames.findIndex(name => name === id) : -1;
    const prev = () => {
      if (currentIndex > 0) navigate(`/prompts/${allPromptNames[currentIndex - 1]}`);
    };
    const next = () => {
      if (currentIndex !== -1 && currentIndex < allPromptNames.length - 1) {
        navigate(`/prompts/${allPromptNames[currentIndex + 1]}`);
      }
    };
    return { currentPromptIndex: currentIndex, handlePrev: prev, handleNext: next };
  }, [id, allPromptNames, navigate]);

  // 변수 추출
  const variables = useMemo(() => {
    if (!selectedVersion) return [];
    const content = selectedVersion.prompt;
    const textToScan = Array.isArray(content)
      ? content.map(c => c.content).join(' ')
      : content;
    const regex = /{{\s*([\w\d_]+)\s*}}/g;
    const matches = textToScan.match(regex) || [];
    const uniqueVars = new Set(matches.map(v => v.replace(/[{}]/g, '').trim()));
    return Array.from(uniqueVars);
  }, [selectedVersion]);

  // 프롬프트 복제
  const handleDuplicateSubmit = async (newName, copyAll) => {
    if (!selectedVersion?.promptDbId) { // promptId -> promptDbId
        alert("복사할 버전의 ID를 찾을 수 없습니다.");
        return;
    }
    try {
        const newPrompt = await duplicatePrompt(selectedVersion.promptDbId, newName, copyAll, projectId);
        alert(`프롬프트가 "${newName}"으로 복제되었습니다.`);
        setDuplicateModalOpen(false);
        if (newPrompt && newPrompt.name) {
            navigate(`/prompts/${newPrompt.name}`);
            // 페이지 이동 후 새로고침하여 전체 프롬프트 목록을 갱신합니다.
            window.location.reload();
        }
    } catch (error) {
        alert(`프롬프트 복제 중 오류 발생: ${error.message}`);
    }
};

  const handleRunExperiment = () => {
    setExperimentModalOpen(false);
  };


  if (isLoading) {
    return <div className={styles.container}><div className={styles.placeholder}>프롬프트를 불러오는 중...</div></div>;
  }

  if (error || !selectedVersion) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.breadcrumbs}>
            <Book size={16} />
            <Link to="/prompts" style={{ color: '#94a3b8', textDecoration: 'none' }}>Prompts</Link>
            <span>/</span>
            <span className={styles.promptName}>{id}</span>
          </div>
        </div>
        <div className={styles.placeholder}>⚠️ {error || "프롬프트 데이터를 찾을 수 없습니다."}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumbs}>
          <h1 className={styles.promptNameH1}>{id}</h1>
          <div className={styles.versionDropdown}>
            {selectedVersion.tags?.map(tag => (
              <span key={tag} className={styles.tagItem}><Tag size={12} /> {tag}</span>
            ))}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.actionButton} onClick={() => setDuplicateModalOpen(true)}>
            <Clipboard size={14} /> Duplicate
          </button>
          <div className={styles.navButtons}>
            <button className={styles.navButton} onClick={handlePrev} disabled={currentPromptIndex <= 0}>
              <ChevronLeft size={16} />
            </button>
            <button className={styles.navButton} onClick={handleNext} disabled={currentPromptIndex === -1 || currentPromptIndex >= allPromptNames.length - 1}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tabButton} ${styles.active}`}>Versions</button>
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.leftPanel}>
          <div className={styles.versionToolbar}>
            <div className={styles.searchBox}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search versions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className={styles.newButton} onClick={handleNewVersion}>
              <Plus size={16} /> New Version
            </button>
          </div>
          <ul className={styles.versionList}>
            {filteredVersions.map(version => (
              <li
                key={version.id}
                className={`${styles.versionItem} ${selectedVersion?.id === version.id ? styles.selected : ''}`}
                onClick={() => setSelectedVersion(version)}
              >
                <div className={styles.versionTitle}>
                  <span className={styles.versionName}>Version {version.id}</span>
                  {version.labels.map(label => (
                    <span key={label} className={label.toLowerCase() === 'production' ? styles.statusTagProd : styles.statusTagLatest}>
                      <GitCommitHorizontal size={12} />{label}
                    </span>
                  ))}
                </div>
                <div className={styles.tagsContainer}>
                    {version.tags?.map(tag => (
                        <span key={tag} className={styles.tagItem}>{tag}</span>
                    ))}
                </div>
                <div className={styles.versionMeta}>
                  <span>{version.details}</span>
                  <span>by {version.author}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.detailTabs}>
            <div className={styles.detailTabButtons}>
              <button className={`${styles.detailTabButton} ${activeDetailTab === 'Prompt' ? styles.active : ''}`} onClick={() => setActiveDetailTab('Prompt')}>Prompt</button>
              <button className={`${styles.detailTabButton} ${activeDetailTab === 'Config' ? styles.active : ''}`} onClick={() => setActiveDetailTab('Config')}>Config</button>
              <button className={`${styles.detailTabButton} ${activeDetailTab === 'Generations' ? styles.active : ''}`} onClick={() => setActiveDetailTab('Generations')}>Linked Generations</button>
              <button className={`${styles.detailTabButton} ${activeDetailTab === 'Use' ? styles.active : ''}`} onClick={() => setActiveDetailTab('Use')}>Use Prompt</button>
            </div>
            <div className={styles.detailActions}>
              <div className={styles.playgroundDropdownContainer} ref={playgroundMenuRef}>
                <button
                  className={styles.playgroundButton}
                  onClick={() => setPlaygroundMenuOpen(prev => !prev)}
                >
                  <Play size={14} /> Playground
                </button>
                {isPlaygroundMenuOpen && (
                  <div className={styles.playgroundDropdownMenu}>
                    <div className={styles.playgroundDropdownItem} onClick={handleGoToPlayground}>Fresh playground</div>
                    <div className={styles.playgroundDropdownItem} onClick={() => alert('Not implemented')}>Add to existing</div>
                  </div>
                )}
              </div>
              <button className={styles.playgroundButton} onClick={() => setExperimentModalOpen(true)}>Dataset run</button>
              <button className={styles.iconButton}><MessageCircle size={16} /></button>
              <button className={styles.iconButton}><MoreVertical size={18} /></button>
            </div>
          </div>

          <div className={styles.promptArea}>
            {activeDetailTab === 'Prompt' && (
              Array.isArray(selectedVersion.prompt) ? (
                // Chat 타입 프롬프트 렌더링
                selectedVersion.prompt.map((message, index) => (
                  <div key={index} className={styles.promptCard}>
                    <div className={styles.promptHeader}>
                      {message.role.toLowerCase() === 'placeholder' 
                        ? `Placeholder: ${message.content || 'untitled'}`
                        : `${message.role.charAt(0).toUpperCase() + message.role.slice(1)} Prompt`
                      }
                    </div>
                    {message.role.toLowerCase() !== 'placeholder' && (
                      <div className={styles.promptBody}>
                        <pre>{message.content}</pre>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                // Text 타입 프롬프트 렌더링
                <div className={styles.promptCard}>
                  <div className={styles.promptHeader}>Text Prompt</div>
                  <div className={styles.promptBody}><pre>{selectedVersion.prompt}</pre></div>
                </div>
              )
            )}

            {activeDetailTab === 'Config' && (
              <div className={styles.promptCard}>
                <div className={styles.promptHeader}>Config</div>
                <div className={styles.promptBody}><pre>{JSON.stringify(selectedVersion.config ?? {}, null, 2)}</pre></div>
              </div>
            )}

            {activeDetailTab === 'Use' && (
              <>
                <div className={styles.promptCard}>
                  <div className={styles.promptHeader}>Python</div>
                  <div className={styles.promptBody}><pre>{selectedVersion.useprompts?.python}</pre></div>
                </div>
                <div className={styles.promptCard}>
                  <div className={styles.promptHeader}>JS/TS</div>
                  <div className={styles.promptBody}><pre>{selectedVersion.useprompts?.jsTs}</pre></div>
                </div>
              </>
            )}

            {activeDetailTab === 'Generations' && <div className={styles.placeholder}>No generations linked yet.</div>}

            {variables.length > 0 && activeDetailTab === 'Prompt' && (
              <div className={styles.variablesInfo}>
                The following variables are available:
                <div className={styles.variablesContainer}>
                  {variables.map(v => <span key={v} className={styles.variableTag}>{v}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isDuplicateModalOpen && (
        <DuplicatePromptModal
          isOpen={isDuplicateModalOpen}
          onClose={() => setDuplicateModalOpen(false)}
          onSubmit={handleDuplicateSubmit}
          currentName={id || ''}
          currentVersion={selectedVersion?.id || 0}
        />
      )}

      {isExperimentModalOpen && (
        <NewExperimentModal
          isOpen={isExperimentModalOpen}
          onClose={() => setExperimentModalOpen(false)}
          onSubmit={handleRunExperiment}
          promptName={id}
          promptVersion={selectedVersion?.id}
        />
      )}
    </div>
  );
}